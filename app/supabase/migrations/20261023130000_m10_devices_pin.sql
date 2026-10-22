-- ---------------------------------------------------------------------------
-- M10 · Dispositivos vinculados y acceso por PIN · EXPAND (auth: requiere
-- revisión de security-reviewer).
-- Depende de 20261021140000 (check_member_pin, pin_login_attempts).
--
-- Modelo:
--   devices: una fila por dispositivo. Ciclo PENDING -> ACTIVE -> REVOKED.
--     PENDING  create_device_link guardó SOLO el hash del token de vinculación
--              (un solo uso, vence en minutos).
--     ACTIVE   activate_device consumió el token (se borra su hash), puso el
--              nombre y guardó SOLO el hash del secreto del dispositivo.
--     REVOKED  revoke_device (revoked_at). Se corta en el siguiente request
--              porque el servidor llama a validate_device en cada uno.
--   Los tokens/secretos son 32 bytes aleatorios (hex) y se guardan como
--   SHA-256: tienen entropía de sobra, un hash lento no aporta. Nunca se
--   escriben en audit_logs. La tabla no tiene grants ni políticas para
--   anon/authenticated: se opera solo por las RPC de abajo.
--
-- Quién llama a qué:
--   OWNER/ADMIN (authenticated): create_device_link, revoke_device, list_devices.
--   SERVIDOR NEXT (service_role, nunca el navegador): get_device_link_info,
--     activate_device, validate_device, pin_login. El navegador del dispositivo
--     no tiene sesión al activarse ni al teclear el PIN; por eso estas cuatro
--     NO se otorgan a anon: el secreto del dispositivo vive solo en una cookie
--     httpOnly puesta por el servidor.
--
-- PIN: pin_login exige un dispositivo ACTIVO del restaurante y delega en
-- check_member_pin_core (la misma lógica de check_member_pin: bloqueo
-- progresivo por restaurante 5 fallos -> 5 min -> 10 min -> duro hasta
-- unlock_pin_login). check_member_pin pasa a ser un envoltorio de la misma
-- lógica con su contrato intacto (llamador miembro activo, mismas respuestas).
-- pin_login NO crea sesión: devuelve user_id/member_id y el servidor crea la
-- sesión (ver PR: generateLink + verifyOtp en servidor).
--
-- Rollback: drop de las RPC y de public.devices; restaurar check_member_pin
-- desde 20261021140000 y drop de check_member_pin_core.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) tabla ===========================================
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text,
  link_token_hash text unique,
  link_expires_at timestamptz,
  token_hash text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint devices_name_len check (name is null or char_length(name) between 2 and 60),
  constraint devices_state_valid check (
    -- PENDING: solo token de vinculación; ACTIVE/REVOKED: ya vinculado
    (linked_at is null and token_hash is null and link_token_hash is not null and link_expires_at is not null)
    or (linked_at is not null and token_hash is not null and link_token_hash is null)
    or (revoked_at is not null)
  )
);

create index if not exists devices_restaurant_idx on public.devices (restaurant_id);
create index if not exists devices_active_idx on public.devices (restaurant_id) where revoked_at is null;
create index if not exists devices_created_by_idx on public.devices (created_by) where created_by is not null;

alter table public.devices enable row level security;
revoke all on table public.devices from public, anon, authenticated;
grant all on table public.devices to service_role;

comment on table public.devices is
  'M10: dispositivos vinculados al restaurante para login por PIN. Solo hashes (SHA-256) de tokens; sin acceso directo para anon/authenticated.';

-- ======================= b) check_member_pin: núcleo compartido =============
create or replace function public.check_member_pin_core(
  p_restaurant_id uuid, p_pin text, p_actor uuid, p_device_id uuid default null
)
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
  v_roles text[];
  v_hard boolean;
  v_until timestamptz;
begin
  if p_restaurant_id is null then
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
    values (p_restaurant_id, p_actor, 'UPDATE', 'PIN_LOGIN', p_restaurant_id,
            jsonb_build_object('device_id', p_device_id, 'event', 'LOCKED_ATTEMPT', 'lock_count', v_att.lock_count, 'hard', v_att.hard_locked,
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
  values (p_restaurant_id, p_actor, 'UPDATE', 'PIN_LOGIN', p_restaurant_id,
          jsonb_build_object('device_id', p_device_id, 'event', 'LOCK_IMPOSED', 'lock_count', v_att.lock_count, 'hard', v_hard,
                             'locked_until', v_until));
  return query select 'LOCKED'::text, null::uuid, null::text[];
end;
$$;

revoke all on function public.check_member_pin_core(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_member_pin_core(uuid, text, uuid, uuid) to service_role;

-- Envoltorio con el contrato de siempre (20261021140000).
create or replace function public.check_member_pin(p_restaurant_id uuid, p_pin text)
returns table (status text, member_id uuid, roles text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_restaurant_id is null then
    return query select 'INVALID'::text, null::uuid, null::text[];
    return;
  end if;

  -- Llamador: miembro activo del restaurante. Si no, INVALID sin tocar contadores.
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

  return query select * from public.check_member_pin_core(p_restaurant_id, p_pin, auth.uid(), null);
end;
$$;

revoke all on function public.check_member_pin(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.check_member_pin(uuid, text) to authenticated;

-- ======================= c) RPC de administración (OWNER/ADMIN) =============
create or replace function public.create_device_link(
  p_restaurant_id uuid,
  p_name text default null,
  p_ttl_minutes integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_ttl integer := greatest(1, least(coalesce(p_ttl_minutes, 10), 60));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_id uuid;
  v_exp timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_restaurant_id is null or not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador vinculan dispositivos' using errcode = '42501';
  end if;
  if v_name is not null and char_length(v_name) not between 2 and 60 then
    raise exception 'El nombre del dispositivo debe tener entre 2 y 60 caracteres';
  end if;

  -- Limpieza: enlaces nunca usados y vencidos hace más de un día.
  delete from public.devices
  where restaurant_id = p_restaurant_id
    and linked_at is null and revoked_at is null
    and link_expires_at < now() - interval '1 day';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(mins => v_ttl);

  insert into public.devices (restaurant_id, name, link_token_hash, link_expires_at, created_by)
  values (p_restaurant_id, v_name, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp, auth.uid())
  returning id into v_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'CREATE', 'DEVICE', v_id,
          jsonb_build_object('event', 'DEVICE_LINK_CREATED', 'expires_at', v_exp));

  -- El token solo viaja en esta respuesta; después existe únicamente su hash.
  return jsonb_build_object('device_id', v_id, 'link_token', v_token, 'expires_at', v_exp);
end;
$$;

revoke all on function public.create_device_link(uuid, text, integer) from public, anon;
grant execute on function public.create_device_link(uuid, text, integer) to authenticated, service_role;

create or replace function public.revoke_device(p_device_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.devices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_d from public.devices where id = p_device_id for update;
  if not found or not (
    public.user_has_restaurant_role(v_d.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_d.restaurant_id, 'ADMIN')
  ) then
    raise exception 'Dispositivo no encontrado' using errcode = '42501';
  end if;

  if v_d.revoked_at is not null then
    return;  -- idempotente
  end if;

  -- Revocado: ya no puede entrar. Un enlace pendiente también queda inservible.
  update public.devices
     set revoked_at = now(), link_token_hash = null, link_expires_at = null
   where id = v_d.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_d.restaurant_id, auth.uid(), 'UPDATE', 'DEVICE', v_d.id,
          jsonb_build_object('event', 'DEVICE_REVOKED', 'name', v_d.name));
end;
$$;

revoke all on function public.revoke_device(uuid) from public, anon;
grant execute on function public.revoke_device(uuid) to authenticated, service_role;

create or replace function public.list_devices(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_restaurant_id is null or not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'status', case when d.revoked_at is not null then 'REVOKED'
                     when d.linked_at is null then 'PENDING' else 'ACTIVE' end,
      'linked_at', d.linked_at,
      'last_used_at', d.last_used_at,
      'revoked_at', d.revoked_at,
      'link_expires_at', case when d.linked_at is null and d.revoked_at is null
                              then d.link_expires_at end
    ) order by coalesce(d.last_used_at, d.linked_at, d.created_at) desc)
    from public.devices d
    where d.restaurant_id = p_restaurant_id
      -- enlaces vencidos sin usar no se listan
      and not (d.linked_at is null and d.revoked_at is null and d.link_expires_at < now())
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_devices(uuid) from public, anon;
grant execute on function public.list_devices(uuid) to authenticated, service_role;

-- ======================= d) RPC del servidor (service_role) =================
-- Pantalla de activación: a qué sucursal se vincula (no consume el token).
create or replace function public.get_device_link_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select d.id, d.name, r.name as restaurant_name, d.restaurant_id
    into v_row
  from public.devices d
  join public.restaurants r on r.id = d.restaurant_id
  where d.link_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and d.linked_at is null and d.revoked_at is null
    and d.link_expires_at > now();

  if not found then
    return null;  -- enlace inválido, usado o vencido
  end if;
  return jsonb_build_object('device_id', v_row.id, 'restaurant_id', v_row.restaurant_id,
                            'restaurant_name', v_row.restaurant_name, 'suggested_name', v_row.name);
end;
$$;

revoke all on function public.get_device_link_info(text) from public, anon, authenticated;
grant execute on function public.get_device_link_info(text) to service_role;

-- Consume el token (un solo uso) y devuelve el secreto del dispositivo UNA vez.
create or replace function public.activate_device(p_token text, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.devices%rowtype;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_secret text;
begin
  select * into v_d
  from public.devices
  where link_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found
     or v_d.linked_at is not null or v_d.revoked_at is not null
     or v_d.link_expires_at is null or v_d.link_expires_at <= now() then
    raise exception 'El enlace no es válido o ya venció' using errcode = 'P0001', hint = 'LINK_INVALID';
  end if;

  v_name := coalesce(v_name, v_d.name);
  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception 'Ponle un nombre al dispositivo (2 a 60 caracteres)';
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  update public.devices
     set name = v_name,
         token_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex'),
         linked_at = now(),
         last_used_at = now(),
         link_token_hash = null,
         link_expires_at = null
   where id = v_d.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_d.restaurant_id, null, 'UPDATE', 'DEVICE', v_d.id,
          jsonb_build_object('event', 'DEVICE_ACTIVATED', 'name', v_name));

  return jsonb_build_object(
    'device_id', v_d.id,
    'restaurant_id', v_d.restaurant_id,
    'name', v_name,
    'device_secret', v_secret
  );
end;
$$;

revoke all on function public.activate_device(text, text) from public, anon, authenticated;
grant execute on function public.activate_device(text, text) to service_role;

-- Cada request del dispositivo: ¿sigue activo? Devuelve null si no (revocado,
-- inexistente). Actualiza last_used_at como máximo una vez por minuto.
create or replace function public.validate_device(p_device_secret text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.devices%rowtype;
begin
  if p_device_secret is null or p_device_secret !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into v_d
  from public.devices
  where token_hash = encode(extensions.digest(p_device_secret, 'sha256'), 'hex')
    and revoked_at is null and linked_at is not null;

  if not found then
    return null;
  end if;

  if v_d.last_used_at is null or v_d.last_used_at < now() - interval '1 minute' then
    update public.devices set last_used_at = now() where id = v_d.id;
  end if;

  return jsonb_build_object('device_id', v_d.id, 'restaurant_id', v_d.restaurant_id, 'name', v_d.name);
end;
$$;

revoke all on function public.validate_device(text) from public, anon, authenticated;
grant execute on function public.validate_device(text) to service_role;

-- Login por PIN. NO crea sesión: devuelve a quién entró para que el SERVIDOR
-- la cree. status: OK | INVALID | LOCKED | DEVICE_INVALID.
-- INVALID/LOCKED vienen de check_member_pin_core (mismo bloqueo progresivo).
create or replace function public.pin_login(p_device_secret text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dev jsonb;
  v_check record;
  v_member record;
  v_device_id uuid;
  v_restaurant_id uuid;
begin
  v_dev := public.validate_device(p_device_secret);
  if v_dev is null then
    return jsonb_build_object('status', 'DEVICE_INVALID');
  end if;
  v_device_id := (v_dev ->> 'device_id')::uuid;
  v_restaurant_id := (v_dev ->> 'restaurant_id')::uuid;

  select * into v_check
  from public.check_member_pin_core(v_restaurant_id, p_pin, null, v_device_id);

  if v_check.status <> 'OK' then
    return jsonb_build_object('status', v_check.status);
  end if;

  -- El miembro sale de la base (por PIN dentro del restaurante del dispositivo),
  -- nunca de un id enviado por el cliente.
  select rm.id, rm.user_id, rm.roles, rm.role::text as role into v_member
  from public.restaurant_members rm
  where rm.id = v_check.member_id
    and rm.restaurant_id = v_restaurant_id
    and rm.status = 'ACTIVE';

  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;

  update public.devices set last_used_at = now() where id = v_device_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_restaurant_id, v_member.user_id, 'LOGIN', 'DEVICE', v_device_id,
          jsonb_build_object('event', 'PIN_LOGIN', 'member_id', v_member.id));

  return jsonb_build_object(
    'status', 'OK',
    'device_id', v_device_id,
    'restaurant_id', v_restaurant_id,
    'member_id', v_member.id,
    'user_id', v_member.user_id,
    'role', v_member.role,
    'roles', to_jsonb(v_member.roles)
  );
end;
$$;

revoke all on function public.pin_login(text, text) from public, anon, authenticated;
grant execute on function public.pin_login(text, text) to service_role;
