-- ---------------------------------------------------------------------------
-- M00-T03 · RPC check_member_pin: valida un PIN de 4 dígitos con límite de
-- intentos (EXPAND: tabla y función nuevas; nada existente cambia).
-- Depende de M00-T01 (pin_hash, roles) y M00-T04 (generate_member_pin, bcrypt).
--
-- Rollback:
--   drop function if exists public.unlock_pin_login(uuid);
--   drop function if exists public.check_member_pin(uuid, text);
--   drop table if exists public.pin_login_attempts;
--
-- Reglas (docs/pos-spec/M00-base.md §5, §7.3):
--   * Quien llama: sesión (auth.uid()) que sea miembro ACTIVO del restaurante
--     (la cuenta del dispositivo/POS). Si no, falla igual que un PIN malo.
--   * El PIN no identifica al miembro, así que se comparan los miembros
--     ACTIVOS del restaurante con pin_hash: extensions.crypt(pin, pin_hash).
--   * Límite de intentos por RESTAURANTE (el miembro es justo lo que no se
--     conoce): 5 fallos seguidos -> bloqueo. Bloqueo PROGRESIVO: cada bloqueo
--     dura el doble que el anterior (5, 10 min...) y al 3.er bloqueo seguido
--     (lock_count = 3, sin ningún acierto entre medio) queda bloqueado SIN
--     vencimiento (hard_locked) hasta que un OWNER/ADMIN llame a
--     unlock_pin_login. Un acierto reinicia contador y escalada.
--   * El intento que impone el bloqueo ya responde LOCKED. Cada respuesta
--     LOCKED (bloqueo impuesto o intento durante un bloqueo) deja una fila en
--     audit_logs (UPDATE sobre PIN_LOGIN, entity_id = restaurante, metadata
--     event/lock_count/hard, sin PIN).
--   * unlock_pin_login(p_restaurant_id): solo OWNER/ADMIN ACTIVO del
--     restaurante; reinicia todo (también el bloqueo duro) y audita.
--   * Devuelve una fila (status, member_id, roles) y NO lanza error en fallos
--     (un raise revertiría el contador). status:
--       OK       -> member_id y roles rellenos
--       INVALID  -> idéntico para PIN inexistente, incorrecto, miembro sin
--                   PIN, inactivo o llamador no autorizado; member_id/roles NULL
--       LOCKED   -> demasiados fallos; no se evalúa el PIN mientras dure
--     LOCKED no revela si el PIN existe (no se mira el PIN al bloquear).
--   * Si dos miembros comparten PIN, el resultado es INVALID (ambiguo): el
--     PIN de 4 dígitos no es único y no se adivina a quién entra.
--   * Formato inválido (no 4 dígitos) cuenta como fallo y da INVALID.
--
-- Concurrencia: fila de intentos con INSERT ... ON CONFLICT y for update.
-- ---------------------------------------------------------------------------

create table if not exists public.pin_login_attempts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  failed_count  int not null default 0,
  lock_count    int not null default 0,       -- bloqueos seguidos sin acierto
  hard_locked   boolean not null default false, -- bloqueo sin vencimiento
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

comment on table public.pin_login_attempts is
  'M00-T03: contador de fallos de PIN por restaurante. Solo lo toca check_member_pin (security definer).';

alter table public.pin_login_attempts enable row level security;
revoke all on public.pin_login_attempts from public, anon, authenticated;

create or replace function public.check_member_pin(p_restaurant_id uuid, p_pin text)
returns table (status text, member_id uuid, roles text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_fails constant int := 5;
  c_lock constant interval := interval '5 minutes';  -- duración del 1.er bloqueo; se duplica en cada uno
  c_max_locks constant int := 3;                     -- al 3.er bloqueo seguido: duro
  v_att public.pin_login_attempts%rowtype;
  v_matches uuid[] := '{}';
  v_m record;
  v_authorized boolean;
  v_roles text[];
  v_hard boolean;
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_restaurant_id is null then
    return query select 'INVALID'::text, null::uuid, null::text[];
    return;
  end if;

  -- Llamador: miembro activo del restaurante. Si no, INVALID sin tocar contadores
  -- (evita que un ajeno bloquee el login de otro restaurante).
  select exists (
    select 1 from public.restaurant_members rm
     where rm.restaurant_id = p_restaurant_id
       and rm.user_id = auth.uid()
       and rm.status = 'ACTIVE'
  ) into v_authorized;
  if not v_authorized then
    return query select 'INVALID'::text, null::uuid, null::text[];
    return;
  end if;

  insert into public.pin_login_attempts (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  select * into v_att
    from public.pin_login_attempts
   where restaurant_id = p_restaurant_id
     for update;

  if v_att.hard_locked or (v_att.locked_until is not null and v_att.locked_until > now()) then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (p_restaurant_id, auth.uid(), 'UPDATE', 'PIN_LOGIN', p_restaurant_id,
            jsonb_build_object('event', 'LOCKED_ATTEMPT', 'lock_count', v_att.lock_count, 'hard', v_att.hard_locked,
                               'locked_until', v_att.locked_until));
    return query select 'LOCKED'::text, null::uuid, null::text[];
    return;
  end if;

  -- Bloqueo vencido: empezar de cero.
  if v_att.locked_until is not null then
    v_att.failed_count := 0;
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{4}$' then
    for v_m in
      select rm.id, rm.pin_hash, rm.roles as m_roles
        from public.restaurant_members rm
       where rm.restaurant_id = p_restaurant_id
         and rm.status = 'ACTIVE'
         and rm.pin_hash is not null
       order by rm.id
    loop
      if extensions.crypt(p_pin, v_m.pin_hash) = v_m.pin_hash then
        v_matches := v_matches || v_m.id;
        v_roles := v_m.m_roles;
      end if;
    end loop;
  end if;

  if cardinality(v_matches) = 1 then
    update public.pin_login_attempts
       set failed_count = 0, lock_count = 0, hard_locked = false, locked_until = null, updated_at = now()
     where restaurant_id = p_restaurant_id;
    return query select 'OK'::text, v_matches[1], v_roles;
    return;
  end if;

  v_att.failed_count := v_att.failed_count + 1;

  if v_att.failed_count < c_max_fails then
    update public.pin_login_attempts
       set failed_count = v_att.failed_count, locked_until = null, updated_at = now()
     where restaurant_id = p_restaurant_id;
    return query select 'INVALID'::text, null::uuid, null::text[];
    return;
  end if;

  -- 5.º fallo: se impone un bloqueo, el doble de largo que el anterior.
  v_att.lock_count := v_att.lock_count + 1;
  v_hard := v_att.lock_count >= c_max_locks;
  v_until := case when v_hard then null else now() + c_lock * power(2, v_att.lock_count - 1)::int end;

  update public.pin_login_attempts
     set failed_count = v_att.failed_count, lock_count = v_att.lock_count,
         hard_locked = v_hard, locked_until = v_until, updated_at = now()
   where restaurant_id = p_restaurant_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'PIN_LOGIN', p_restaurant_id,
          jsonb_build_object('event', 'LOCK_IMPOSED', 'lock_count', v_att.lock_count, 'hard', v_hard,
                             'locked_until', v_until));
  return query select 'LOCKED'::text, null::uuid, null::text[];
end;
$$;

comment on function public.check_member_pin(uuid, text) is
  'M00-T03: valida un PIN de 4 dígitos contra los miembros activos del restaurante. Devuelve (status OK|INVALID|LOCKED, member_id, roles). 5 fallos -> bloqueo progresivo por restaurante (5, 10 min; al 3.º queda bloqueado hasta unlock_pin_login). Cada LOCKED se audita. Error genérico idéntico para PIN inexistente o incorrecto.';

revoke all on function public.check_member_pin(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.check_member_pin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unlock_pin_login: un OWNER/ADMIN activo quita el bloqueo (también el duro).
-- ---------------------------------------------------------------------------
create or replace function public.unlock_pin_login(p_restaurant_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_att public.pin_login_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_restaurant_id is null or not exists (
    select 1 from public.restaurant_members rm
     where rm.restaurant_id = p_restaurant_id
       and rm.user_id = auth.uid()
       and rm.status = 'ACTIVE'
       and rm.role in ('OWNER', 'ADMIN')
  ) then
    raise exception 'No tienes permiso para desbloquear el PIN' using errcode = '42501';
  end if;

  select * into v_att
    from public.pin_login_attempts
   where restaurant_id = p_restaurant_id
     for update;

  if not found then
    return;  -- nunca hubo intentos: nada que desbloquear
  end if;

  update public.pin_login_attempts
     set failed_count = 0, lock_count = 0, hard_locked = false, locked_until = null, updated_at = now()
   where restaurant_id = p_restaurant_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'PIN_LOGIN', p_restaurant_id,
          jsonb_build_object('event', 'UNLOCKED', 'was_hard', v_att.hard_locked, 'lock_count', v_att.lock_count));
end;
$$;

comment on function public.unlock_pin_login(uuid) is
  'M00-T03: OWNER/ADMIN activo reinicia el bloqueo progresivo del PIN de su restaurante (incluido el bloqueo duro). Audita.';

revoke all on function public.unlock_pin_login(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unlock_pin_login(uuid) to authenticated;
