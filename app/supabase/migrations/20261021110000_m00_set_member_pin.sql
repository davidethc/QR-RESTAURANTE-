-- ---------------------------------------------------------------------------
-- M00-T04 · RPC set_member_pin: guarda el PIN de un miembro con bcrypt
-- (EXPAND: función nueva; nada existente cambia).
--
-- Rollback:
--   drop function if exists public.set_member_pin(uuid, text);
--   (los pin_hash ya guardados se quedan: son hashes, no se borran datos)
--
-- Reglas (docs/pos-spec/M00-base.md §5, §6, §7.1):
--   * Quien llama: sesión (auth.uid()) con rol OWNER o ADMIN ACTIVO en el
--     restaurante del miembro. Mismas reglas que assert_can_manage_member
--     (se reutiliza): ADMIN solo gestiona WAITER/KITCHEN; OWNER también
--     ADMIN; nadie toca al OWNER ni a sí mismo por esta ruta.
--   * PIN: exactamente 4 dígitos ASCII (spec M00 §3/§7.1, confirmado por el
--     jefe general). Se valida aquí aunque el servidor ya lo valide con zod.
--   * pin_hash = bcrypt de pgcrypto (esquema extensions en Supabase), coste
--     10, sal aleatoria por llamada. Se puede verificar en SQL con
--     extensions.crypt(pin, pin_hash) = pin_hash (M00-T03).
--   * PIN ÚNICO por restaurante (lo necesita check_member_pin, M00-T03): si
--     otro miembro del mismo restaurante ya tiene ese PIN, se lanza SQLSTATE
--     23505 con mensaje 'PIN_IN_USE' (genérico: no dice de quién es). Se
--     compara con crypt(pin, pin_hash) sobre los demás miembros con pin_hash.
--     pg_advisory_xact_lock por restaurante serializa dos altas simultáneas.
--   * No devuelve nada: ni el PIN ni el hash salen de la base.
--   * audit_logs: UPDATE sobre RESTAURANT_MEMBER, metadata sin PIN ni hash.
--
-- Concurrencia: rol antes del candado (mismo orden que void_bill), luego
-- for update sobre la fila del miembro y se repite la verificación con la
-- fila bloqueada, por si su rol o restaurante cambió entre medio.
--
-- Lectura de pin_hash: ya resuelta en M00-T01 (20261020120000): anon sin
-- SELECT de tabla y authenticated con SELECT por columna sin pin_hash. Esta
-- migración no cambia grants de la tabla; la prueba lo vuelve a comprobar.
-- ---------------------------------------------------------------------------

create or replace function public.set_member_pin(p_member_id uuid, p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.restaurant_members%rowtype;
  v_had_pin boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener exactamente 4 números';
  end if;

  perform public.assert_can_manage_member(p_member_id);

  select * into v_member
    from public.restaurant_members
   where id = p_member_id
     for update;

  if not found then
    raise exception 'Esa persona no existe';
  end if;

  perform public.assert_can_manage_member(p_member_id);

  -- Un solo guardado de PIN a la vez por restaurante (evita la carrera entre
  -- dos altas con el mismo PIN). Va después del for update de la fila: todos
  -- los llamadores siguen el orden fila -> candado de restaurante.
  perform pg_advisory_xact_lock(hashtextextended('set_member_pin:' || v_member.restaurant_id::text, 0));

  if exists (
    select 1
      from public.restaurant_members m
     where m.restaurant_id = v_member.restaurant_id
       and m.id <> v_member.id
       and m.pin_hash is not null
       and extensions.crypt(p_pin, m.pin_hash) = m.pin_hash
  ) then
    raise exception 'PIN_IN_USE' using errcode = '23505', hint = 'Ese PIN ya lo usa otro miembro';
  end if;

  v_had_pin := v_member.pin_hash is not null;

  update public.restaurant_members
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_member.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_member.restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT_MEMBER', v_member.id,
    jsonb_build_object('change', case when v_had_pin then 'PIN_CHANGED' else 'PIN_SET' end)
  );
end;
$$;

comment on function public.set_member_pin(uuid, text) is
  'M00-T04: OWNER/ADMIN guarda el PIN (4 dígitos) de un miembro que puede gestionar, como bcrypt en pin_hash. No devuelve el hash. Audita sin el PIN.';

revoke all on function public.set_member_pin(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_member_pin(uuid, text) to authenticated;
