-- ---------------------------------------------------------------------------
-- Gestión de personal desde el panel.
--
-- Reglas:
--   * Solo OWNER y ADMIN ven y gestionan al personal.
--   * ADMIN gestiona solo meseros y cocina; OWNER gestiona también admins.
--   * El rol OWNER no se asigna ni se quita desde el panel.
--   * Nadie se cambia el rol ni se desactiva a sí mismo.
--
-- Crear la cuenta de acceso (auth.users) lo hace el servidor con la llave
-- secreta; estas funciones solo deciden quién puede qué y escriben en
-- restaurant_members/profiles. Se quitan las políticas de INSERT/UPDATE
-- directo sobre restaurant_members: con ellas un ADMIN podía darse OWNER a
-- sí mismo por la API.
-- ---------------------------------------------------------------------------

drop policy if exists restaurant_members_insert_admin on public.restaurant_members;
drop policy if exists restaurant_members_update_admin on public.restaurant_members;


-- ¿Puede quien llama asignar/gestionar este rol en este restaurante?
create or replace function public.can_manage_staff_role(
  p_restaurant_id uuid,
  p_role public.member_role
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_role = 'OWNER' then false
    when p_role = 'ADMIN' then public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    else public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
      or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  end;
$$;

revoke all on function public.can_manage_staff_role(uuid, public.member_role) from public, anon;
grant execute on function public.can_manage_staff_role(uuid, public.member_role) to authenticated;


create or replace function public.get_restaurant_staff(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')) then
    raise exception 'No autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'member_id',  rm.id,
      'user_id',    rm.user_id,
      'full_name',  nullif(p.full_name, ''),
      'email',      u.email,
      'role',       rm.role,
      'status',     rm.status,
      'created_at', rm.created_at,
      'is_me',      rm.user_id = auth.uid(),
      'can_manage', rm.user_id <> auth.uid()
                    and public.can_manage_staff_role(rm.restaurant_id, rm.role)
    ) order by rm.status, rm.role, p.full_name), '[]'::jsonb)
  into v_result
  from public.restaurant_members rm
  join public.profiles p on p.id = rm.user_id
  join auth.users u on u.id = rm.user_id
  where rm.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke all on function public.get_restaurant_staff(uuid) from public, anon;
grant execute on function public.get_restaurant_staff(uuid) to authenticated;


-- La cuenta ya la creó el servidor; aquí se vincula al restaurante.
create or replace function public.add_staff_member(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_role public.member_role,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.can_manage_staff_role(p_restaurant_id, p_role) then
    raise exception 'No puedes agregar personal con ese rol';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Escribe el nombre de la persona';
  end if;

  if exists (select 1 from public.restaurant_members where user_id = p_user_id) then
    raise exception 'Ese correo ya pertenece a un restaurante';
  end if;

  update public.profiles
     set full_name = trim(p_full_name), updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'La cuenta no existe';
  end if;

  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  values (p_restaurant_id, p_user_id, p_role, 'ACTIVE')
  returning id into v_member_id;

  return v_member_id;
end;
$$;

revoke all on function public.add_staff_member(uuid, uuid, public.member_role, text) from public, anon;
grant execute on function public.add_staff_member(uuid, uuid, public.member_role, text) to authenticated;


-- Devuelve el user_id del miembro si quien llama puede gestionarlo (lo usa el
-- servidor antes de tocar la cuenta de acceso: clave, bloqueo).
create or replace function public.assert_can_manage_member(p_member_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_member public.restaurant_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_member from public.restaurant_members where id = p_member_id;

  if not found then
    raise exception 'Esa persona no existe';
  end if;

  if v_member.user_id = auth.uid() then
    raise exception 'No puedes cambiar tu propia cuenta desde aquí';
  end if;

  if not public.can_manage_staff_role(v_member.restaurant_id, v_member.role) then
    raise exception 'No tienes permiso para gestionar a esta persona';
  end if;

  return v_member.user_id;
end;
$$;

revoke all on function public.assert_can_manage_member(uuid) from public, anon;
grant execute on function public.assert_can_manage_member(uuid) to authenticated;


create or replace function public.update_staff_member(
  p_member_id uuid,
  p_role public.member_role,
  p_status public.member_status
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
begin
  perform public.assert_can_manage_member(p_member_id);

  select restaurant_id into v_restaurant_id
    from public.restaurant_members where id = p_member_id;

  if not public.can_manage_staff_role(v_restaurant_id, p_role) then
    raise exception 'No puedes asignar ese rol';
  end if;

  update public.restaurant_members
     set role = p_role, status = p_status, updated_at = now()
   where id = p_member_id;
end;
$$;

revoke all on function public.update_staff_member(uuid, public.member_role, public.member_status) from public, anon;
grant execute on function public.update_staff_member(uuid, public.member_role, public.member_status) to authenticated;
