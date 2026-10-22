-- ---------------------------------------------------------------------------
-- M00-T04 · RPC get_staff_pin_status: dice qué miembros tienen PIN
-- (EXPAND: función nueva; nada existente cambia).
--
-- Rollback:
--   drop function if exists public.get_staff_pin_status(uuid);
--
-- Motivo: authenticated no puede leer pin_hash (grants por columna de
-- M00-T01), pero la pantalla de edición de personal necesita saber si cada
-- miembro ya tiene PIN ("Cambiar PIN" vs "Asignar PIN").
--
-- Reglas:
--   * Quien llama: sesión (auth.uid()) con rol OWNER o ADMIN ACTIVO en
--     p_restaurant_id; si no, error P0001 (mismo estilo que
--     get_restaurant_staff y generate_member_pin).
--   * Devuelve solo member_id y has_pin (pin_hash is not null) de los
--     miembros de ese restaurante. El hash nunca sale de la base.
--   * Solo lectura (STABLE), sin auditoría.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_pin_status(p_restaurant_id uuid)
returns table (member_id uuid, has_pin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_restaurant_id is null
     or not (public.user_has_restaurant_role(p_restaurant_id, 'OWNER'::public.member_role)
             or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN'::public.member_role)) then
    raise exception 'No autorizado';
  end if;

  return query
  select rm.id, rm.pin_hash is not null
    from public.restaurant_members rm
   where rm.restaurant_id = p_restaurant_id;
end;
$$;

comment on function public.get_staff_pin_status(uuid) is
  'M00-T04: OWNER/ADMIN activo consulta qué miembros de su restaurante tienen PIN. Devuelve solo member_id y has_pin, nunca el hash.';

revoke all on function public.get_staff_pin_status(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_staff_pin_status(uuid) to authenticated;
