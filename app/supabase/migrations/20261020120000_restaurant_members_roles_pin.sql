-- ---------------------------------------------------------------------------
-- M00-T01 · restaurant_members: roles múltiples, PIN, cajas y acceso por correo
-- (EXPAND, compatible con la app de producción actual).
--
-- Columnas nuevas (docs/pos-spec/M00-base.md §3, §5, §6):
--   pin_hash             hash del PIN de 4 dígitos. Nunca texto plano.
--   roles                roles del catálogo asignable (§6), en paralelo a role.
--   cash_register_ids    cajas asignadas; solo cuenta si roles incluye CASHIER.
--   email_login_enabled  si el miembro entra también con correo.
--
-- Nada existente cambia: role (member_role) sigue siendo la fuente de verdad
-- de la app y de las RPCs actuales, y el dueño se sigue identificando por
-- role = 'OWNER' (SUPER_ADMIN no se asigna ni se guarda en roles).
--
-- Decisiones:
--   * pin_hash sin índice. El PIN irá con hash con sal (p. ej. bcrypt de
--     pgcrypto): el mismo PIN da hashes distintos, así que un índice sobre
--     pin_hash no sirve para buscar por PIN. La forma de buscar al miembro en
--     el login por PIN se diseña en M00-T03.
--   * email_login_enabled default true. Hoy todo miembro entra con correo
--     (Supabase Auth) y add_staff_member crea miembros con cuenta de correo
--     sin conocer esta columna; con default false esas altas quedarían
--     marcadas como "sin correo" aunque entren con correo. Cuando exista el
--     alta solo-PIN (M00-T03), esa RPC enviará false explícito.
--   * roles se deriva de role con un trigger mientras convivan (ver abajo).
--     Si alguien cambia role (app actual), roles se recalcula entero, aunque
--     tuviera roles extra: la app actual solo ve role y no debe dejar
--     permisos que no muestra. Si el mismo UPDATE cambia roles, gana roles.
--   * pin_hash no es legible por la API: se quita el SELECT de tabla a
--     anon/authenticated y se devuelve SELECT por columna sin pin_hash (mismo
--     patrón que table_sessions.session_token, 20260928152915). La app no
--     hace select directo sobre restaurant_members (grep de app/src,
--     2026-10-20: solo RPCs SECURITY DEFINER), ni está en la publicación de
--     Realtime. Todas las funciones que leen la tabla son SECURITY DEFINER.
--     anon no tiene política RLS en esta tabla: se le quita SELECT entero.
--
-- OJO para migraciones futuras: una columna nueva en restaurant_members NO
-- queda legible para authenticated hasta agregarla al grant por columna.
-- ---------------------------------------------------------------------------

-- ADD COLUMN toma ACCESS EXCLUSIVE: si hay otra sesión con la tabla tomada,
-- fallar rápido en vez de quedar en cola frenando a la app.
set local lock_timeout = '5s';

alter table public.restaurant_members
  add column pin_hash text,
  add column roles text[] not null default '{}',
  add column cash_register_ids uuid[] not null default '{}',
  add column email_login_enabled boolean not null default true;

comment on column public.restaurant_members.pin_hash is
  'Hash con sal del PIN de 4 dígitos. Nunca texto plano. No legible por anon/authenticated.';
comment on column public.restaurant_members.roles is
  'Roles del catálogo asignable (M00 §6). Convive con role: el trigger restaurant_members_sync_roles lo deriva de role.';
comment on column public.restaurant_members.cash_register_ids is
  'Cajas asignadas al miembro; solo relevante si roles incluye CASHIER.';
comment on column public.restaurant_members.email_login_enabled is
  'El miembro puede entrar con correo (Supabase Auth) además del PIN.';


-- Regla role -> roles (la misma del backfill).
create or replace function public.restaurant_members_sync_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_derived text[] := case new.role
    when 'OWNER'::public.member_role   then array['ADMIN']
    when 'ADMIN'::public.member_role   then array['ADMIN']
    when 'WAITER'::public.member_role  then array['WAITER']
    when 'KITCHEN'::public.member_role then array['KITCHEN']
  end;
begin
  if tg_op = 'INSERT' then
    if new.roles is null or cardinality(new.roles) = 0 then
      new.roles := v_derived;
    end if;
  elsif new.role is distinct from old.role
        and new.roles is not distinct from old.roles then
    new.roles := v_derived;
  end if;
  return new;
end;
$$;

revoke all on function public.restaurant_members_sync_roles() from public, anon, authenticated;


-- Backfill sin tocar updated_at (no es un cambio hecho por una persona).
alter table public.restaurant_members disable trigger restaurant_members_set_updated_at;

update public.restaurant_members
   set roles = case role
     when 'OWNER'   then array['ADMIN']
     when 'ADMIN'   then array['ADMIN']
     when 'WAITER'  then array['WAITER']
     when 'KITCHEN' then array['KITCHEN']
   end
 where roles = '{}';

alter table public.restaurant_members enable trigger restaurant_members_set_updated_at;


alter table public.restaurant_members
  add constraint restaurant_members_roles_catalog check (
    array_position(roles, null) is null
    and roles <@ array['ADMIN', 'MEMBERS_ADMIN', 'BRANCH_MANAGER', 'MENU_MANAGER',
                       'CASHIER', 'WAITER', 'KITCHEN']::text[]
  );

create trigger restaurant_members_sync_roles
before insert or update of role on public.restaurant_members
for each row execute function public.restaurant_members_sync_roles();


-- pin_hash fuera del alcance de la API.
revoke select on public.restaurant_members from anon, authenticated;

grant select (
  id,
  restaurant_id,
  user_id,
  role,
  status,
  created_at,
  updated_at,
  roles,
  cash_register_ids,
  email_login_enabled
) on public.restaurant_members to authenticated;


-- Ya existe desde 20260902051200 (014); no-op si sigue ahí.
create index if not exists idx_restaurant_members_restaurant
  on public.restaurant_members (restaurant_id);
