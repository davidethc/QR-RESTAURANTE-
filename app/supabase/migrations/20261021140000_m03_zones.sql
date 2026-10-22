-- ---------------------------------------------------------------------------
-- M03-T01 · Zonas y posiciones de mesas (EXPAND).
-- Fuente: docs/pos-spec/M03-zonas-mesas.md §3, §5, §10 y M00-base.md.
--
-- Compatible con la app actual: zone_id y coordenadas son nullable; forma y
-- dimensiones tienen defaults. No cambia qr_token, number, kind ni RPCs.
-- Las mesas actuales (incluido COUNTER) se agrupan en "Salón", sin inventar
-- posiciones ni limitar cuántas caben en la cuadrícula inicial de 7 x 5.
-- Altas de la app antigua siguen admitiendo zone_id = null hasta M03-T03.
--
-- Decisiones / pendientes de la spec:
--   * sort_order >= 0 implementa el orden solicitado; la spec no fija nombre
--     ni orden automático. Se permite el mismo orden para varias zonas.
--   * Coordenadas base cero; ambas null significa "sin colocar". La spec no
--     fija el origen ni máximos: solo se comprueban mínimos y el par completo.
--     Límites del plano y solapamiento multicelda pertenecen a M03-T02/T03.
--   * Nombres únicos exactos por restaurante, sin espacios al borde ni vacíos.
--     La spec no define equivalencia entre mayúsculas/acentos.
--   * FK compuesta impide asignar una zona de otro restaurante. RESTRICT
--     impide borrar cualquier zona con mesas, incluso con sesiones activas;
--     no borra mesas/sesiones en cascada. M03-T03 deberá definir cómo tratar
--     las mesas de zonas sin sesiones antes de permitir su eliminación.
--   * Se usa role legado OWNER/ADMIN, como la app y RLS actuales. El permiso
--     BRANCH_MANAGER queda pendiente de la transición de permisos de M00.
--   * RLS/grants de tables se conservan (sin abrir DELETE); anon pierde todo
--     acceso directo. El cliente QR sigue usando sus RPCs SECURITY DEFINER.
--
-- Rollback: primero revertir el código consumidor; la app anterior funciona
-- con esta expansión, así que conservar tabla/columnas es el rollback seguro.
-- No ejecutar DROP ni borrar zonas/datos. Una retirada física requeriría una
-- migración CONTRACT separada, revisión de dependencias y respaldo del plano.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  name text not null,
  sort_order integer not null default 0,
  grid_cols integer not null default 7,
  grid_rows integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zones_name_valid check (name = btrim(name) and name <> ''),
  constraint zones_sort_order_nonnegative check (sort_order >= 0),
  constraint zones_grid_cols_positive check (grid_cols >= 1),
  constraint zones_grid_rows_positive check (grid_rows >= 1),
  constraint zones_restaurant_name_key unique (restaurant_id, name),
  constraint zones_id_restaurant_key unique (id, restaurant_id)
);

create index zones_restaurant_sort_order_idx
  on public.zones (restaurant_id, sort_order, id);

-- ACCESS EXCLUSIVE hasta el fin de la migración: no se cuelan altas de mesas
-- entre ADD COLUMN y backfill. lock_timeout evita bloquear la app en cola.
alter table public.tables
  add column zone_id uuid,
  add column shape text not null default 'square',
  add column col integer,
  add column row integer,
  add column width_cells integer not null default 1,
  add column height_cells integer not null default 1,
  add constraint tables_zone_restaurant_fkey foreign key (zone_id, restaurant_id)
    references public.zones (id, restaurant_id) on delete restrict,
  add constraint tables_shape_valid check (shape in ('square', 'round')),
  add constraint tables_col_nonnegative check (col >= 0),
  add constraint tables_row_nonnegative check (row >= 0),
  add constraint tables_position_pair check ((col is null) = (row is null)),
  add constraint tables_position_requires_zone check (col is null or zone_id is not null),
  add constraint tables_width_cells_positive check (width_cells >= 1),
  add constraint tables_height_cells_positive check (height_cells >= 1);

create index tables_zone_restaurant_idx on public.tables (zone_id, restaurant_id);

comment on column public.tables.zone_id is
  'Zona del mismo restaurante; nullable durante EXPAND para las altas de la app anterior.';
comment on column public.tables.col is
  'Columna base cero. col y row null indican mesa todavía sin colocar.';
comment on column public.tables.row is
  'Fila base cero. col y row null indican mesa todavía sin colocar.';

-- Backfill idempotente: reusa Salón y solo asigna mesas todavía sin zona.
insert into public.zones (restaurant_id, name)
select distinct t.restaurant_id, 'Salón'
from public.tables t
where t.zone_id is null
on conflict (restaurant_id, name) do nothing;

-- Igual que M00-T01: no registrar el backfill como edición humana.
alter table public.tables disable trigger tables_set_updated_at;

update public.tables t
set zone_id = z.id
from public.zones z
where z.restaurant_id = t.restaurant_id
  and z.name = 'Salón'
  and t.zone_id is null;

alter table public.tables enable trigger tables_set_updated_at;

alter table public.zones enable row level security;

create policy zones_select_members on public.zones
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy zones_insert_admin on public.zones
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy zones_update_admin on public.zones
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy zones_delete_admin on public.zones
  for delete to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

revoke all on table public.zones from public, anon, authenticated;
grant select, insert, update, delete on table public.zones to authenticated;
grant all on table public.zones to service_role;
revoke all on table public.tables from public, anon;

create trigger zones_set_updated_at
before update on public.zones
for each row execute function public.set_updated_at();
