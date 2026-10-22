-- ---------------------------------------------------------------------------
-- M02-T01 · Disponibilidad por variante y opción (EXPAND).
-- Fuente: docs/pos-spec/M02-disponibilidad.md §3, §5, §10; M01-catalogo.md.
-- Depende de product_variants (M01-T02) y modifier_options (M01-T03).
--
-- La app actual conserva products.available; esta migración no lo modifica ni
-- elimina. availability guarda una fila por cada variante y modifier_option.
-- Las opciones nuevas nacen disponibles; variants heredan products.available
-- al insertarse como hoy (caso legacy) y se seed-ean con ese valor.
--
-- Integridad tenant: item_id es polimórfico y PostgreSQL no permite declararle
-- una FK condicional a dos tablas. Se conservan item_id/item_type de la spec,
-- además de product_id/group_id tipados, mantenidos por el trigger invoker.
-- Cuatro FKs compuestas atan variant -> product -> restaurant, y option ->
-- modifier_group -> restaurant. Los índices únicos requeridos en las tablas
-- padre exponen las claves compuestas; los FKs hijos también quedan indexados.
-- Así las FKs, no una comprobación de aplicación, rechazan cruces tenant.
--
-- Backfill idempotente: variantes heredan el booleano legacy; opciones reciben
-- true (products.available solo expresa el producto y la spec no define una
-- herencia para opciones). ON CONFLICT DO NOTHING conserva un estado nuevo si
-- se vuelve a ejecutar. Bloqueos SHARE ROW EXCLUSIVE cortos evitan perder altas
-- concurrentes entre el backfill y la instalación de triggers.
--
-- Permisos: miembros ACTIVE del restaurante leen; OWNER/ADMIN escriben, como
-- el resto de tablas M01. M02 §5/§6 también asigna el cambio de estado a roles
-- operativos; M02-T03 deberá ofrecer ese camino con autorización controlada
-- (la política de escritura de esta tabla sigue el patrón OWNER/ADMIN pedido
-- para esta migración).
--
-- Rollback antes de consumir la tabla: borrar triggers de seed, sus funciones,
-- función de integridad, políticas y tabla availability; luego quitar los
-- cuatro índices compuestos auxiliares. No se requiere restaurar products ni
-- sus variantes/opciones: products.available nunca se modifica. Tras desplegar
-- consumidores, primero revertirlos y conservar los datos hasta un contract
-- revisado por separado.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Claves compuestas que permiten encadenar FKs hasta el tenant sin agregar ni
-- desnormalizar columnas en product_variants, modifier_options o sus padres.
create unique index product_variants_id_product_id_key
  on public.product_variants (id, product_id);
create unique index products_id_restaurant_id_key
  on public.products (id, restaurant_id);
create unique index modifier_options_id_group_id_key
  on public.modifier_options (id, group_id);
create unique index modifier_groups_id_restaurant_id_key
  on public.modifier_groups (id, restaurant_id);

create table public.availability (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  product_id uuid,
  group_id uuid,
  available boolean not null default true,
  constraint availability_item_type_check
    check (item_type in ('variant', 'modifier_option')),
  constraint availability_parent_by_type_check
    check (
      (item_type = 'variant' and product_id is not null and group_id is null)
      or (item_type = 'modifier_option' and product_id is null and group_id is not null)
    ),
  constraint availability_restaurant_item_key
    primary key (restaurant_id, item_type, item_id),
  constraint availability_variant_fkey
    foreign key (item_id, product_id)
    references public.product_variants (id, product_id) on delete cascade,
  constraint availability_variant_restaurant_fkey
    foreign key (product_id, restaurant_id)
    references public.products (id, restaurant_id) on delete cascade,
  constraint availability_modifier_option_fkey
    foreign key (item_id, group_id)
    references public.modifier_options (id, group_id) on delete cascade,
  constraint availability_modifier_group_restaurant_fkey
    foreign key (group_id, restaurant_id)
    references public.modifier_groups (id, restaurant_id) on delete cascade
);

comment on table public.availability is
  'Estado disponible/agotado por variante o modifier_option (M02). products.available se conserva sin cambios durante el expand.';
comment on column public.availability.item_id is
  'ID de product_variants o modifier_options, según item_type.';
comment on column public.availability.product_id is
  'Padre tipado para la cadena de FK compuestas variant -> restaurant; null para modifier_option.';
comment on column public.availability.group_id is
  'Padre tipado para la cadena de FK compuestas modifier_option -> restaurant; null para variant.';

create index availability_product_id_idx
  on public.availability (product_id, restaurant_id)
  where product_id is not null;
create index availability_group_id_idx
  on public.availability (group_id, restaurant_id)
  where group_id is not null;
create index availability_item_variant_idx
  on public.availability (item_id, product_id)
  where item_type = 'variant';
create index availability_item_modifier_option_idx
  on public.availability (item_id, group_id)
  where item_type = 'modifier_option';
create index availability_restaurant_available_idx
  on public.availability (restaurant_id, available);

-- Lock both item sources in consistent order; reads continue while writes wait.
lock table public.product_variants, public.modifier_options
  in share row exclusive mode;

-- 1. RLS and grants -----------------------------------------------------------
alter table public.availability enable row level security;

create policy availability_select_members on public.availability
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy availability_insert_admin on public.availability
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy availability_update_admin on public.availability
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy availability_delete_admin on public.availability
  for delete to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

revoke all on table public.availability from public, anon, authenticated;
grant select, insert, update, delete on table public.availability to authenticated;
grant all on table public.availability to service_role;

-- 2. Validar el ID polimórfico y derivar su padre ------------------------------
create or replace function public.availability_set_parent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  if new.item_type = 'variant' then
    new.group_id := null;
    select p.restaurant_id, p.id
      into strict v_restaurant_id, new.product_id
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = new.item_id;
  elsif new.item_type = 'modifier_option' then
    new.product_id := null;
    select g.restaurant_id, g.id
      into strict v_restaurant_id, new.group_id
    from public.modifier_options o
    join public.modifier_groups g on g.id = o.group_id
    where o.id = new.item_id;
  else
    raise exception 'Tipo de disponibilidad inválido' using errcode = '23514';
  end if;

  if new.restaurant_id is distinct from v_restaurant_id then
    raise exception 'El ítem no pertenece al restaurante indicado'
      using errcode = '23503';
  end if;

  return new;
exception
  when no_data_found then
    raise exception 'El ítem no existe o no pertenece al restaurante indicado'
      using errcode = '23503';
end;
$$;

revoke all on function public.availability_set_parent() from public, anon, authenticated;

create trigger availability_set_parent
before insert or update of restaurant_id, item_type, item_id
on public.availability
for each row execute function public.availability_set_parent();

-- 3. Backfill repetible --------------------------------------------------------
insert into public.availability
  (restaurant_id, item_type, item_id, product_id, available)
select p.restaurant_id, 'variant', v.id, p.id, p.available
from public.product_variants v
join public.products p on p.id = v.product_id
on conflict (restaurant_id, item_type, item_id) do nothing;

insert into public.availability
  (restaurant_id, item_type, item_id, group_id, available)
select g.restaurant_id, 'modifier_option', o.id, g.id, true
from public.modifier_options o
join public.modifier_groups g on g.id = o.group_id
on conflict (restaurant_id, item_type, item_id) do nothing;

-- 4. Las altas que ocurran después del backfill nacen disponibles ------------
create or replace function public.availability_seed_variant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_available boolean;
begin
  select p.restaurant_id, p.available into strict v_restaurant_id, v_available
  from public.products p where p.id = new.product_id;

  insert into public.availability
    (restaurant_id, item_type, item_id, product_id, available)
  values (v_restaurant_id, 'variant', new.id, new.product_id, v_available)
  on conflict (restaurant_id, item_type, item_id) do nothing;
  return null;
end;
$$;

revoke all on function public.availability_seed_variant() from public, anon, authenticated;

create trigger availability_seed_variant
  after insert on public.product_variants
  for each row execute function public.availability_seed_variant();

create or replace function public.availability_seed_modifier_option()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  select g.restaurant_id into strict v_restaurant_id
  from public.modifier_groups g where g.id = new.group_id;

  insert into public.availability
    (restaurant_id, item_type, item_id, group_id, available)
  values (v_restaurant_id, 'modifier_option', new.id, new.group_id, true)
  on conflict (restaurant_id, item_type, item_id) do nothing;
  return null;
end;
$$;

revoke all on function public.availability_seed_modifier_option() from public, anon, authenticated;

create trigger availability_seed_modifier_option
  after insert on public.modifier_options
  for each row execute function public.availability_seed_modifier_option();
