-- ---------------------------------------------------------------------------
-- M01-T01 · Horarios de carta y opciones de servicio por producto (EXPAND).
-- Spec: docs/pos-spec/M01-catalogo.md §3, §5 y §6.
--
-- Compatible con la app que hoy está en producción: solo agrega tablas y
-- columnas con default. No cambia ninguna RPC ni borra columnas.
--
-- Decisiones:
--   * schedules: un horario de carta por restaurante ("Menú general",
--     "Desayunos"...). Nombre único por restaurante: así "Menú general" se
--     identifica sin ambigüedad y su creación concurrente es idempotente
--     (insert ... on conflict do nothing).
--   * schedule_shifts: weekday sigue la convención de extract(dow) y de
--     Date.getDay(): 0 = domingo ... 6 = sábado. Un turno PUEDE cruzar la
--     medianoche: si ends_at < starts_at, el turno empieza el weekday indicado
--     y termina al día siguiente (ej. viernes 20:00 → sábado 02:00 se guarda
--     como weekday = 5, 20:00, 02:00). starts_at = ends_at se rechaza porque es
--     ambiguo (0 h o 24 h); un día abierto todo el día se expresa sin turnos.
--     Un horario sin turnos = abierto 24 h (spec §5).
--   * categories.schedule_ids uuid[]: los arrays no admiten FK, así que la
--     integridad se garantiza con triggers:
--       - BEFORE INSERT/UPDATE en categories: los ids agregados deben ser
--         horarios del mismo restaurante (si no, 23503 foreign_key_violation).
--         Solo se validan los ids NUEVOS respecto a la fila anterior, para que
--         quitar ids nunca falle (p. ej. en el borrado en cascada de un
--         restaurante). Se eliminan duplicados y se rechazan elementos null.
--       - INSERT con el array vacío (la app actual no conoce la columna):
--         se asigna el "Menú general" del restaurante; si no existe, se crea.
--       - AFTER DELETE en schedules: el id se quita de las categorías.
--     Un UPDATE que deja el array vacío se permite (no se reasigna el
--     "Menú general"): su significado en la carta lo define la tarea de UI.
--   * products.service_options jsonb: todas las opciones en true por
--     defecto; el CHECK solo exige la forma mínima (objeto con pos y
--     digital_menu como objetos). Convive con products.available.
--   * RLS igual que categories: leen los miembros activos, escriben solo
--     OWNER/ADMIN con restaurant_members.role. anon sin acceso (la carta
--     pública no lo necesita todavía).
--   * Funciones de trigger SECURITY INVOKER con search_path = '' y nombres
--     calificados: corren con los permisos (y la RLS) de quien escribe la
--     categoría o borra el horario, que ya es OWNER/ADMIN de ese restaurante.
--
-- Efecto colateral del backfill: el UPDATE de categories dispara
-- categories_set_updated_at, así que updated_at de todas las categorías
-- existentes pasa a la hora de la migración.
-- ---------------------------------------------------------------------------

-- 1. Horarios -----------------------------------------------------------------
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_restaurant_name_key unique (restaurant_id, name)
);

comment on table public.schedules is
  'Horarios de carta (M01). Sin turnos = abierto 24 h. Cada restaurante tiene un "Menú general" por defecto.';

create trigger schedules_set_updated_at
before update on public.schedules
for each row execute function public.set_updated_at();

create table public.schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  constraint schedule_shifts_not_empty check (starts_at <> ends_at)
);

comment on table public.schedule_shifts is
  'Turnos de un horario. weekday 0 = domingo ... 6 = sábado. Si ends_at < starts_at el turno cruza la medianoche y termina al día siguiente.';

create index schedule_shifts_schedule_weekday_idx on public.schedule_shifts (schedule_id, weekday);

-- 2. RLS y permisos -----------------------------------------------------------
alter table public.schedules enable row level security;
alter table public.schedule_shifts enable row level security;

create policy schedules_select_members on public.schedules
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy schedules_insert_admin on public.schedules
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy schedules_update_admin on public.schedules
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy schedules_delete_admin on public.schedules
  for delete to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy schedule_shifts_select_members on public.schedule_shifts
  for select to authenticated
  using (exists (
    select 1 from public.schedules s
    where s.id = schedule_id
      and public.user_belongs_to_restaurant(s.restaurant_id)
  ));

create policy schedule_shifts_insert_admin on public.schedule_shifts
  for insert to authenticated
  with check (exists (
    select 1 from public.schedules s
    where s.id = schedule_id
      and (public.user_has_restaurant_role(s.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(s.restaurant_id, 'ADMIN'))
  ));

create policy schedule_shifts_update_admin on public.schedule_shifts
  for update to authenticated
  using (exists (
    select 1 from public.schedules s
    where s.id = schedule_id
      and (public.user_has_restaurant_role(s.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(s.restaurant_id, 'ADMIN'))
  ))
  with check (exists (
    select 1 from public.schedules s
    where s.id = schedule_id
      and (public.user_has_restaurant_role(s.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(s.restaurant_id, 'ADMIN'))
  ));

create policy schedule_shifts_delete_admin on public.schedule_shifts
  for delete to authenticated
  using (exists (
    select 1 from public.schedules s
    where s.id = schedule_id
      and (public.user_has_restaurant_role(s.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(s.restaurant_id, 'ADMIN'))
  ));

revoke all on table public.schedules, public.schedule_shifts from public, anon, authenticated;
grant select, insert, update, delete on table public.schedules, public.schedule_shifts to authenticated;
grant all on table public.schedules, public.schedule_shifts to service_role;

-- 3. categories.schedule_ids --------------------------------------------------
alter table public.categories
  add column schedule_ids uuid[] not null default '{}',
  add constraint categories_schedule_ids_no_nulls check (array_position(schedule_ids, null) is null);

comment on column public.categories.schedule_ids is
  'Horarios (public.schedules) en los que se muestra la categoría. Sin FK: integridad por triggers. Al insertar vacío se asigna el "Menú general".';

-- Backfill: un "Menú general" por restaurante y todas las categorías existentes dentro.
insert into public.schedules (restaurant_id, name)
select r.id, 'Menú general'
from public.restaurants r
on conflict (restaurant_id, name) do nothing;

update public.categories c
set schedule_ids = array[s.id]
from public.schedules s
where s.restaurant_id = c.restaurant_id
  and s.name = 'Menú general'
  and c.schedule_ids = '{}';

create or replace function public.categories_schedule_ids_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_added uuid[];
  v_found int;
begin
  if new.schedule_ids is null or array_position(new.schedule_ids, null) is not null then
    raise exception 'schedule_ids no admite valores nulos' using errcode = '23502';
  end if;

  if tg_op = 'INSERT' and cardinality(new.schedule_ids) = 0 then
    insert into public.schedules (restaurant_id, name)
    values (new.restaurant_id, 'Menú general')
    on conflict (restaurant_id, name) do nothing;

    new.schedule_ids := array(
      select s.id from public.schedules s
      where s.restaurant_id = new.restaurant_id and s.name = 'Menú general'
    );
    return new;
  end if;

  new.schedule_ids := array(select distinct u from unnest(new.schedule_ids) as u order by u);

  if tg_op = 'UPDATE' and new.restaurant_id = old.restaurant_id then
    v_added := array(select unnest(new.schedule_ids) except select unnest(old.schedule_ids));
  else
    v_added := new.schedule_ids;
  end if;

  if cardinality(v_added) = 0 then
    return new;
  end if;

  -- for share: un DELETE concurrente del horario espera a que esta fila se confirme.
  select count(*) into v_found
  from (
    select s.id from public.schedules s
    where s.id = any (v_added) and s.restaurant_id = new.restaurant_id
    for share
  ) x;

  if v_found <> cardinality(v_added) then
    raise exception 'Algún horario no existe o no pertenece a este restaurante'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.categories_schedule_ids_guard() from public, anon, authenticated;

create trigger categories_schedule_ids_guard
before insert or update of schedule_ids, restaurant_id on public.categories
for each row execute function public.categories_schedule_ids_guard();

create or replace function public.schedules_remove_from_categories()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.categories c
  set schedule_ids = array_remove(c.schedule_ids, old.id)
  where c.restaurant_id = old.restaurant_id
    and c.schedule_ids @> array[old.id];
  return old;
end;
$$;

revoke all on function public.schedules_remove_from_categories() from public, anon, authenticated;

create trigger schedules_remove_from_categories
after delete on public.schedules
for each row execute function public.schedules_remove_from_categories();

-- 4. products.service_options -------------------------------------------------
alter table public.products
  add column service_options jsonb not null default
    '{"pos":{"tables":true,"dine_in_no_table":true,"takeaway":true,"delivery":true},"digital_menu":{"tables":true,"pickup":true,"delivery":true}}'::jsonb,
  add constraint products_service_options_shape check (
    jsonb_typeof(service_options) = 'object'
    and jsonb_typeof(service_options -> 'pos') is not distinct from 'object'
    and jsonb_typeof(service_options -> 'digital_menu') is not distinct from 'object'
  );

comment on column public.products.service_options is
  'Dónde se ofrece el producto: pos {tables, dine_in_no_table, takeaway, delivery} y digital_menu {tables, pickup, delivery}. Todo true por defecto.';
