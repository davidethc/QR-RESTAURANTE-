-- ---------------------------------------------------------------------------
-- M00-T04 · RPC generate_member_pin: la BASE genera el PIN de 4 dígitos de un
-- miembro, lo guarda con bcrypt y lo devuelve en claro UNA sola vez
-- (EXPAND: función nueva; nada existente cambia). El archivo conserva su
-- nombre (*_set_member_pin.sql) porque la migración aún no está aplicada.
--
-- Rollback:
--   drop function if exists public.generate_member_pin(uuid);
--   (los pin_hash ya guardados se quedan: son hashes, no se borran datos)
--
-- Reglas (docs/pos-spec/M00-base.md §5, §6, §7.1):
--   * Quien llama: sesión (auth.uid()) con rol OWNER o ADMIN ACTIVO en el
--     restaurante del miembro. Mismas reglas que assert_can_manage_member
--     (se reutiliza): ADMIN solo gestiona WAITER/KITCHEN; OWNER también
--     ADMIN; nadie toca al OWNER ni a sí mismo por esta ruta.
--   * El admin NO elige el PIN: lo genera la base. Así no hay oráculo para
--     descubrir PIN ajenos (ya no existe el error PIN_IN_USE).
--   * PIN: 4 dígitos ASCII (spec M00 §3/§7.1) sacados de gen_random_bytes(2)
--     por rechazo (valores >= 60000 se descartan) para que no haya sesgo de
--     módulo. Único por restaurante (lo necesita check_member_pin, M00-T03):
--     se reintenta ante colisión con crypt() contra los demás miembros con
--     pin_hash, dentro de un pg_advisory_xact_lock por restaurante que
--     serializa dos generaciones simultáneas. Tope de 500 intentos: si no
--     queda ningún PIN libre se lanza 'PIN_POOL_EXHAUSTED'.
--   * pin_hash = bcrypt de pgcrypto (esquema extensions en Supabase), coste
--     10, sal aleatoria por llamada. Se verifica en SQL con
--     extensions.crypt(pin, pin_hash) = pin_hash (M00-T03).
--   * Devuelve el PIN en claro una sola vez; después solo existe el hash.
--     Cada llamada reemplaza el PIN anterior (nunca repite el del propio
--     miembro ni el de otro del restaurante).
--   * audit_logs: UPDATE sobre RESTAURANT_MEMBER con change PIN_SET /
--     PIN_CHANGED y generated=true; metadata sin PIN ni hash.
--
-- Concurrencia: rol antes del candado (mismo orden que void_bill), luego
-- for update sobre la fila del miembro y se repite la verificación con la
-- fila bloqueada, por si su rol o restaurante cambió entre medio.
--
-- Lectura de pin_hash: ya resuelta en M00-T01 (20261020120000): anon sin
-- SELECT de tabla y authenticated con SELECT por columna sin pin_hash. Esta
-- migración no cambia grants de la tabla; la prueba lo vuelve a comprobar.
-- ---------------------------------------------------------------------------

create or replace function public.generate_member_pin(p_member_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member public.restaurant_members%rowtype;
  v_had_pin boolean;
  v_pin text;
  v_bytes bytea;
  v_n int;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
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

  -- Una generación de PIN a la vez por restaurante (evita que dos llamadas
  -- simultáneas elijan el mismo PIN). Va después del for update de la fila:
  -- todos los llamadores siguen el orden fila -> candado de restaurante.
  perform pg_advisory_xact_lock(hashtextextended('generate_member_pin:' || v_member.restaurant_id::text, 0));

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 500 then
      raise exception 'PIN_POOL_EXHAUSTED' using hint = 'No quedan PIN libres en este restaurante';
    end if;

    v_bytes := extensions.gen_random_bytes(2);
    v_n := get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1);
    continue when v_n >= 60000;  -- 60000 = 6 * 10000: sin sesgo de módulo
    v_pin := lpad((v_n % 10000)::text, 4, '0');

    -- Colisión con cualquier miembro del restaurante (incluido el propio:
    -- un cambio de PIN siempre cambia el PIN).
    exit when not exists (
      select 1
        from public.restaurant_members m
       where m.restaurant_id = v_member.restaurant_id
         and m.pin_hash is not null
         and extensions.crypt(v_pin, m.pin_hash) = m.pin_hash
    );
  end loop;

  v_had_pin := v_member.pin_hash is not null;

  update public.restaurant_members
     set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_member.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_member.restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT_MEMBER', v_member.id,
    jsonb_build_object('change', case when v_had_pin then 'PIN_CHANGED' else 'PIN_SET' end, 'generated', true)
  );

  return v_pin;
end;
$$;

comment on function public.generate_member_pin(uuid) is
  'M00-T04: OWNER/ADMIN genera un PIN aleatorio de 4 dígitos, único por restaurante, para un miembro que puede gestionar; lo guarda como bcrypt en pin_hash y lo devuelve en claro una sola vez. Audita sin el PIN.';

revoke all on function public.generate_member_pin(uuid) from public, anon, authenticated, service_role;
grant execute on function public.generate_member_pin(uuid) to authenticated;
