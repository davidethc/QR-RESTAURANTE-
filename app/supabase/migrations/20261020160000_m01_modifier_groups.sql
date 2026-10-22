-- ---------------------------------------------------------------------------
-- M01-T03 · Grupos de personalización reutilizables (EXPAND).
-- Spec: docs/pos-spec/M01-catalogo.md §3 ("Migración de datos"), §5 y §10.1.
--
-- Crea modifier_groups, modifier_options y el puente product_modifier_groups,
-- y los llena desde product_options / product_option_values. Compatible con la
-- app de producción: no cambia ninguna RPC ni toca las tablas legacy (ni sus
-- filas ni su updated_at). No depende de product_variants (M01-T02).
--
-- Modelo:
--   * modifier_groups: name = instrucción que ve el cliente, internal_label
--     opcional (no visible), min_select >= 0 (0 = opcional), max_select >= 1,
--     max_select >= min_select, allow_repeat (default false).
--   * modifier_options: opciones de un grupo, price numeric(10,2) >= 0.
--   * product_modifier_groups: N:N producto-grupo con position; único
--     (product_id, group_id). Un trigger exige que producto y grupo sean del
--     mismo restaurante (23503).
--   * Un grupo sin filas en product_modifier_groups es un grupo "Sin usar"
--     (spec §5). Al borrar un grupo, el puente se borra en cascada; el aviso
--     "lo usan N productos" (§10.1) es un count(*) del puente por group_id,
--     cubierto por product_modifier_groups_group_idx.
--
-- Mapeo legacy -> nuevo (una sola función, la misma para el backfill y la
-- sincronía): public.sync_legacy_modifier_group(product_option_id).
--   * Cada product_options ACTIVO genera un grupo propio de su producto
--     (legacy_option_id = id de origen, único) con:
--       name        = product_options.name
--       min_select  = 1 si required, si no 0
--       max_select  = cantidad de opciones migradas (mínimo 1, por el CHECK)
--       allow_repeat = false
--     y un vínculo en product_modifier_groups con position = product_options.position.
--   * Cada product_option_values ACTIVO con price_modifier >= 0 genera una
--     modifier_options (legacy_value_id = id de origen, único) con name,
--     price = price_modifier y position.
--   * product_options.type (texto libre) NO se usa: la spec fija max_select =
--     cantidad de opciones sin importar el tipo. DUDA DE PRODUCTO: si algún
--     type significa "elige una" (radio/single), el grupo debería tener
--     max_select = 1. Corregirlo después es un UPDATE de max_select en los
--     grupos con ese legacy type, sin pérdida de datos.
--   * price_modifier < 0: DUDA DE PRODUCTO (modifier_options.price es >= 0
--     por spec). No se migra esa opción ni cuenta para max_select; la migración
--     la lista con RAISE NOTICE y se puede volver a listar con la consulta del
--     informe. Es lo más reversible: la fila legacy queda intacta y, si producto
--     decide (p. ej. permitir descuentos), basta con relajar el CHECK y
--     re-sincronizar ese product_option.
--   * Filas inactivas (active = false): no se migran (opción inactiva = grupo
--     inexistente; valor inactivo = opción inexistente). Reactivarlas las crea.
--   * Casos borde que el CHECK obliga: un product_options sin valores migrables
--     queda con max_select = 1 y 0 opciones (si además es required, el grupo
--     es imposible de cumplir, igual que hoy en legacy). Se listan en el informe.
--
-- Compatibilidad durante la transición (legacy -> nuevo, un solo sentido):
--   * Triggers AFTER en product_options y product_option_values llaman a la
--     función de sincronía para el product_options afectado. Se eligieron
--     triggers y no un backfill repetible porque los grupos nuevos quedan al
--     día en la misma transacción que la escritura legacy, sin depender de que
--     alguien vuelva a correr un script; y como la sincronía es idempotente y
--     reutiliza el código del backfill, el test del backfill también prueba la
--     sincronía. Hoy authenticated no tiene INSERT/UPDATE/DELETE sobre las
--     tablas legacy (20260928152948): solo escriben service_role y postgres.
--   * Borrar un product_options o un product_option_values borra su espejo por
--     FK on delete cascade (legacy_option_id / legacy_value_id). Si el borrado
--     de un valor viene en cascada (su product_options ya no existe), el trigger
--     no llama a la sincronía: así un OWNER puede borrar un producto con
--     personalización legacy (deleteProduct) sin EXECUTE sobre la sincronía.
--   * Los grupos con legacy_option_id son espejos administrados por la
--     sincronía hasta la fase contract: una edición manual a name/min/max o a
--     sus opciones legacy se sobrescribe en la próxima escritura legacy de ese
--     producto. Para fusionar en reutilizables, el equipo de menú crea grupos
--     nuevos (sin legacy_option_id). Las opciones agregadas a mano (sin
--     legacy_value_id) a un grupo espejo no se borran.
--   * Contract: cuando nada lea legacy, se borran los triggers, la función y
--     las FK legacy_*; las columnas legacy_* pueden quedar como trazabilidad.
--
-- Seguridad:
--   * RLS como products: leen los miembros activos (user_belongs_to_restaurant),
--     escriben OWNER/ADMIN (user_has_restaurant_role); anon sin permisos.
--   * Ninguna fila hija cambia de padre ni de restaurante: trigger BEFORE
--     UPDATE (22023) sobre modifier_groups.restaurant_id,
--     modifier_options.group_id y product_modifier_groups.product_id/group_id,
--     y sobre legacy_option_id / legacy_value_id. Trigger y no grants por
--     columna: también cubre a service_role y postgres.
--   * legacy_option_id / legacy_value_id solo pueden apuntar a filas legacy del
--     mismo restaurante / del mismo product_options del grupo (23503): un
--     OWNER no puede "adoptar" la personalización de otro restaurante.
--   * Funciones SECURITY INVOKER, search_path = '' y nombres calificados;
--     EXECUTE revocado a public/anon/authenticated. La función de sincronía
--     se concede solo a service_role (la llama el trigger como quien escribe
--     legacy). Si una migración futura devuelve a authenticated la escritura
--     sobre product_options, debe concederle también EXECUTE sobre
--     sync_legacy_modifier_group (es invoker: con RLS solo toca su restaurante).
--   * Concurrencia: la sincronía toma pg_advisory_xact_lock por
--     product_options, así dos escrituras simultáneas de valores del mismo
--     product_options no dejan max_select desfasado.
--
-- El backfill no hace UPDATE en tablas legacy (no toca su updated_at) y en
-- las tablas nuevas los upserts solo actualizan si algo cambió.
--
-- Rollback (antes de que algo lea las tablas nuevas), en este orden:
--   drop trigger product_option_values_sync_modifiers on public.product_option_values;
--   drop trigger product_options_sync_modifiers on public.product_options;
--   drop function public.product_option_values_sync_modifiers(), public.product_options_sync_modifiers(), public.sync_legacy_modifier_group(uuid);
--   drop table public.product_modifier_groups, public.modifier_options, public.modifier_groups;
--   drop function public.modifier_legacy_link_guard(), public.product_modifier_groups_same_restaurant(), public.modifier_forbid_parent_change();
-- Las tablas legacy no se tocan, así que no hay datos que restaurar.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1. Tablas -------------------------------------------------------------------
create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  internal_label text,
  min_select int not null default 0,
  max_select int not null default 1,
  allow_repeat boolean not null default false,
  legacy_option_id uuid references public.product_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modifier_groups_min_select_check check (min_select >= 0),
  constraint modifier_groups_max_select_check check (max_select >= 1),
  constraint modifier_groups_min_le_max check (max_select >= min_select),
  constraint modifier_groups_legacy_option_id_key unique (legacy_option_id)
);

comment on table public.modifier_groups is
  'Grupos de personalización (M01). min_select 0 = opcional. Sin vínculos en product_modifier_groups = "Sin usar".';
comment on column public.modifier_groups.name is 'Instrucción que ve el cliente (ej. "Elige tu salsa").';
comment on column public.modifier_groups.internal_label is 'Etiqueta interna para el panel; no se muestra al cliente.';
comment on column public.modifier_groups.legacy_option_id is
  'product_options de origen (backfill/sincronía M01-T03). Null en grupos creados en el sistema nuevo.';

create index modifier_groups_restaurant_idx on public.modifier_groups (restaurant_id);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  position int not null default 0,
  legacy_value_id uuid references public.product_option_values (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modifier_options_price_non_negative check (price >= 0),
  constraint modifier_options_legacy_value_id_key unique (legacy_value_id)
);

comment on table public.modifier_options is 'Opciones de un grupo de personalización (M01). price >= 0.';
comment on column public.modifier_options.legacy_value_id is
  'product_option_values de origen (backfill/sincronía M01-T03). Null en opciones creadas en el sistema nuevo.';

create index modifier_options_group_idx on public.modifier_options (group_id);

create table public.product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint product_modifier_groups_product_group_key unique (product_id, group_id)
);

comment on table public.product_modifier_groups is
  'Vínculo N:N producto - grupo de personalización (M01). Producto y grupo del mismo restaurante.';

create index product_modifier_groups_group_idx on public.product_modifier_groups (group_id);

create trigger modifier_groups_set_updated_at
before update on public.modifier_groups
for each row execute function public.set_updated_at();

create trigger modifier_options_set_updated_at
before update on public.modifier_options
for each row execute function public.set_updated_at();

-- 2. Integridad ---------------------------------------------------------------
create or replace function public.modifier_forbid_parent_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_col text;
begin
  foreach v_col in array tg_argv loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception '% no se puede cambiar en %', v_col, tg_table_name
        using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.modifier_forbid_parent_change() from public, anon, authenticated;

create trigger modifier_groups_forbid_parent_change
before update of restaurant_id, legacy_option_id on public.modifier_groups
for each row execute function public.modifier_forbid_parent_change('restaurant_id', 'legacy_option_id');

create trigger modifier_options_forbid_parent_change
before update of group_id, legacy_value_id on public.modifier_options
for each row execute function public.modifier_forbid_parent_change('group_id', 'legacy_value_id');

create trigger product_modifier_groups_forbid_parent_change
before update of product_id, group_id on public.product_modifier_groups
for each row execute function public.modifier_forbid_parent_change('product_id', 'group_id');

create or replace function public.product_modifier_groups_same_restaurant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.products p
    join public.modifier_groups g on g.restaurant_id = p.restaurant_id
    where p.id = new.product_id
      and g.id = new.group_id
  ) then
    raise exception 'El producto y el grupo de personalización deben ser del mismo restaurante'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.product_modifier_groups_same_restaurant() from public, anon, authenticated;

create trigger product_modifier_groups_same_restaurant
before insert on public.product_modifier_groups
for each row execute function public.product_modifier_groups_same_restaurant();

create or replace function public.modifier_legacy_link_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'modifier_groups' then
    if new.legacy_option_id is not null and not exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = new.legacy_option_id
        and p.restaurant_id = new.restaurant_id
    ) then
      raise exception 'legacy_option_id no pertenece a este restaurante' using errcode = '23503';
    end if;
  else
    if new.legacy_value_id is not null and not exists (
      select 1
      from public.product_option_values v
      join public.modifier_groups g on g.legacy_option_id = v.product_option_id
      where v.id = new.legacy_value_id
        and g.id = new.group_id
    ) then
      raise exception 'legacy_value_id no pertenece a este grupo' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.modifier_legacy_link_guard() from public, anon, authenticated;

create trigger modifier_groups_legacy_link_guard
before insert on public.modifier_groups
for each row execute function public.modifier_legacy_link_guard();

create trigger modifier_options_legacy_link_guard
before insert on public.modifier_options
for each row execute function public.modifier_legacy_link_guard();

-- 3. RLS y permisos -----------------------------------------------------------
alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.product_modifier_groups enable row level security;

create policy modifier_groups_select_members on public.modifier_groups
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy modifier_groups_insert_admin on public.modifier_groups
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy modifier_groups_update_admin on public.modifier_groups
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy modifier_groups_delete_admin on public.modifier_groups
  for delete to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy modifier_options_select_members on public.modifier_options
  for select to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and public.user_belongs_to_restaurant(g.restaurant_id)
  ));

create policy modifier_options_insert_admin on public.modifier_options
  for insert to authenticated
  with check (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ));

create policy modifier_options_update_admin on public.modifier_options
  for update to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ))
  with check (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ));

create policy modifier_options_delete_admin on public.modifier_options
  for delete to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ));

create policy product_modifier_groups_select_members on public.product_modifier_groups
  for select to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and public.user_belongs_to_restaurant(g.restaurant_id)
  ));

create policy product_modifier_groups_insert_admin on public.product_modifier_groups
  for insert to authenticated
  with check (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ));

create policy product_modifier_groups_update_admin on public.product_modifier_groups
  for update to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ))
  with check (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ));

create policy product_modifier_groups_delete_admin on public.product_modifier_groups
  for delete to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    where g.id = group_id
      and (public.user_has_restaurant_role(g.restaurant_id, 'OWNER')
           or public.user_has_restaurant_role(g.restaurant_id, 'ADMIN'))
  ));

revoke all on table public.modifier_groups, public.modifier_options, public.product_modifier_groups
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.modifier_groups, public.modifier_options, public.product_modifier_groups
  to authenticated;
grant all on table public.modifier_groups, public.modifier_options, public.product_modifier_groups
  to service_role;

-- 4. Sincronía legacy -> nuevo ------------------------------------------------
create or replace function public.sync_legacy_modifier_group(p_option_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_option     public.product_options%rowtype;
  v_restaurant uuid;
  v_group      uuid;
  v_max        int;
begin
  if p_option_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('modifier_sync:' || p_option_id::text, 0)
  );

  select po.* into v_option from public.product_options po where po.id = p_option_id;
  select p.restaurant_id into v_restaurant from public.products p where p.id = v_option.product_id;

  if v_option.id is null or v_restaurant is null or not v_option.active then
    delete from public.modifier_groups where legacy_option_id = p_option_id;
    return;
  end if;

  select count(*) into v_max
  from public.product_option_values v
  where v.product_option_id = p_option_id
    and v.active
    and v.price_modifier >= 0;

  v_max := greatest(v_max, 1);

  insert into public.modifier_groups as g
    (restaurant_id, name, min_select, max_select, allow_repeat, legacy_option_id)
  values
    (v_restaurant, v_option.name, case when v_option.required then 1 else 0 end, v_max, false, p_option_id)
  on conflict (legacy_option_id) do update
    set name = excluded.name,
        min_select = excluded.min_select,
        max_select = excluded.max_select
    where (g.name, g.min_select, g.max_select)
          is distinct from (excluded.name, excluded.min_select, excluded.max_select);

  select g.id into v_group from public.modifier_groups g where g.legacy_option_id = p_option_id;

  delete from public.modifier_options o
  where o.group_id = v_group
    and o.legacy_value_id is not null
    and not exists (
      select 1 from public.product_option_values v
      where v.id = o.legacy_value_id
        and v.product_option_id = p_option_id
        and v.active
        and v.price_modifier >= 0
    );

  insert into public.modifier_options as o (group_id, name, price, position, legacy_value_id)
  select v_group, v.name, v.price_modifier, v.position, v.id
  from public.product_option_values v
  where v.product_option_id = p_option_id
    and v.active
    and v.price_modifier >= 0
  on conflict (legacy_value_id) do update
    set name = excluded.name,
        price = excluded.price,
        position = excluded.position
    where (o.name, o.price, o.position)
          is distinct from (excluded.name, excluded.price, excluded.position);

  insert into public.product_modifier_groups as b (product_id, group_id, position)
  values (v_option.product_id, v_group, v_option.position)
  on conflict (product_id, group_id) do update
    set position = excluded.position
    where b.position is distinct from excluded.position;
end;
$$;

comment on function public.sync_legacy_modifier_group(uuid) is
  'M01-T03: refleja un product_options (y sus valores) en modifier_groups/options/product_modifier_groups. Idempotente. Se borra en la fase contract.';

revoke all on function public.sync_legacy_modifier_group(uuid) from public, anon, authenticated;
grant execute on function public.sync_legacy_modifier_group(uuid) to service_role;

create or replace function public.product_options_sync_modifiers()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    -- Cambió de producto: el espejo no puede cambiar de padre; se rehace.
    delete from public.modifier_groups where legacy_option_id = old.id;
  end if;
  perform public.sync_legacy_modifier_group(new.id);
  return null;
end;
$$;

revoke all on function public.product_options_sync_modifiers() from public, anon, authenticated;

create trigger product_options_sync_modifiers
after insert or update on public.product_options
for each row execute function public.product_options_sync_modifiers();

create or replace function public.product_option_values_sync_modifiers()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Borrado en cascada desde products/product_options (deleteProduct como
  -- authenticated): el product_options ya no existe y su espejo cae por la FK
  -- legacy_option_id. No se llama a la sincronía, sobre la que authenticated
  -- no tiene EXECUTE (el trigger AFTER corre como quien borra, no como dueño).
  if tg_op = 'DELETE' and not exists (
    select 1 from public.product_options po where po.id = old.product_option_id
  ) then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if tg_op = 'UPDATE' and new.product_option_id is distinct from old.product_option_id then
      delete from public.modifier_options where legacy_value_id = old.id;
    end if;
    if tg_op = 'DELETE' or new.product_option_id is distinct from old.product_option_id then
      perform public.sync_legacy_modifier_group(old.product_option_id);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_legacy_modifier_group(new.product_option_id);
  end if;
  return null;
end;
$$;

revoke all on function public.product_option_values_sync_modifiers() from public, anon, authenticated;

create trigger product_option_values_sync_modifiers
after insert or update or delete on public.product_option_values
for each row execute function public.product_option_values_sync_modifiers();

-- 5. Backfill -----------------------------------------------------------------
do $$
declare
  v_row record;
begin
  for v_row in
    select v.id, v.product_option_id, v.name, v.price_modifier
    from public.product_option_values v
    join public.product_options po on po.id = v.product_option_id
    where v.price_modifier < 0 and v.active and po.active
    order by v.product_option_id, v.position
  loop
    raise notice 'M01-T03 no migrado (price_modifier < 0): value % option % "%" %',
      v_row.id, v_row.product_option_id, v_row.name, v_row.price_modifier;
  end loop;
end $$;

do $$
declare
  v_id uuid;
begin
  for v_id in select po.id from public.product_options po order by po.id loop
    perform public.sync_legacy_modifier_group(v_id);
  end loop;
end $$;
