-- ---------------------------------------------------------------------------
-- Personal · add_staff_member solo vincula cuentas recién creadas.
--
-- Antes aceptaba cualquier p_user_id sin restaurante: un OWNER/ADMIN podía
-- vincular a su restaurante (y renombrar) la cuenta de cualquier persona
-- con solo conocer su id.
--
-- Ahora p_user_id se acepta solo si la cuenta de auth:
--   · existe y no es anónima,
--   · no pertenece a ningún restaurante,
--   · fue creada hace menos de 15 minutos,
--   · nunca inició sesión (last_sign_in_at is null),
--   · no es la de quien llama.
-- Es exactamente lo que hace el flujo de la app (lib/actions/staff-admin.ts):
-- admin.auth.admin.createUser(...) e inmediatamente add_staff_member.
--
-- Alternativa más fuerte evaluada (requiere cambiar app/src, fuera de esta
-- fase): que el server marque la cuenta al crearla con
-- app_metadata.pending_restaurant_id (solo la llave secreta puede escribir
-- app_metadata) y que esta RPC exija que coincida con p_restaurant_id. Ata la
-- cuenta al restaurante que la creó, no solo a una ventana de tiempo.
--
-- Se agrega auditoría (CREATE / RESTAURANT_MEMBER), que faltaba.
-- ---------------------------------------------------------------------------

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
  v_user      record;
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

  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'La cuenta no existe';
  end if;

  -- Serializa dos altas simultáneas de la misma cuenta.
  perform pg_advisory_xact_lock(hashtextextended('add_staff_member:' || p_user_id::text, 0));

  select u.created_at, u.last_sign_in_at, coalesce(u.is_anonymous, false) as is_anonymous
  into v_user
  from auth.users u
  where u.id = p_user_id;

  if not found or v_user.is_anonymous then
    raise exception 'La cuenta no existe';
  end if;

  if exists (select 1 from public.restaurant_members where user_id = p_user_id) then
    raise exception 'Ese correo ya pertenece a un restaurante';
  end if;

  if v_user.last_sign_in_at is not null
     or v_user.created_at < now() - interval '15 minutes' then
    raise exception 'Solo se puede agregar una cuenta recién creada desde la pantalla de Personal';
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

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_restaurant_id, auth.uid(), 'CREATE', 'RESTAURANT_MEMBER', v_member_id,
    jsonb_build_object('member_user_id', p_user_id, 'role', p_role)
  );

  return v_member_id;
end;
$$;

revoke all on function public.add_staff_member(uuid, uuid, public.member_role, text) from public, anon;
grant execute on function public.add_staff_member(uuid, uuid, public.member_role, text) to authenticated, service_role;
