-- ---------------------------------------------------------------------------
-- Venta de mostrador · C1 · Esquema.
--
-- Una venta de mostrador ("para llevar") reutiliza TODO el circuito de mesa:
-- tables -> table_sessions -> orders -> bills -> payments. Así cocina,
-- cobro, caja, tickets y reportes funcionan sin ramas nuevas. La diferencia:
--
--   · tables.kind = 'COUNTER': una mesa "Mostrador" por restaurante (número
--     0, que ninguna mesa real puede tener), oculta de la rejilla, del QR y
--     del PDF. Se crea sola en la primera venta (create_counter_sale, C4).
--   · Cada venta es una table_session propia del mostrador. Varias pueden
--     estar ACTIVE a la vez; en una mesa normal sigue habiendo UNA sola.
--   · table_sessions.counter_number: "Para llevar #N", correlativo por día
--     de negocio. customer_label: nombre opcional ("Ana").
--   · table_sessions.client_request_id: idempotencia de create_counter_sale
--     (un reintento no manda un segundo pedido a cocina).
--
-- table_sessions.table_kind copia tables.kind y lo garantiza una FK
-- compuesta (table_id, table_kind) -> tables(id, kind): el índice único
-- parcial de "una sesión ACTIVE por mesa" no puede mirar otra tabla, así que
-- necesita el dato en la fila. Como el default es 'TABLE', cualquier camino
-- viejo (resolve_table_qr, create_staff_order) que intente abrir una sesión
-- en el mostrador falla por la FK aunque se olvide un guard.
--
-- Reportes: venta de mostrador = orders/bills cuyo table_id apunta a una
-- mesa kind = 'COUNTER' (o table_sessions.table_kind = 'COUNTER').
-- ---------------------------------------------------------------------------

create type public.table_kind as enum ('TABLE', 'COUNTER');

alter table public.tables
  add column kind public.table_kind not null default 'TABLE';

-- Mesa real: número >= 1. Mostrador: número 0 (no choca con ninguna mesa).
alter table public.tables drop constraint tables_number_positive;
alter table public.tables
  add constraint tables_number_by_kind check (
    (kind = 'TABLE' and number > 0) or (kind = 'COUNTER' and number = 0)
  );

-- Un solo mostrador por restaurante (árbitro del ON CONFLICT de C4).
create unique index tables_one_counter_per_restaurant
  on public.tables (restaurant_id)
  where kind = 'COUNTER';

-- Destino de la FK compuesta desde table_sessions.
alter table public.tables
  add constraint tables_id_kind_key unique (id, kind);

-- El tipo de una mesa no cambia nunca (la política tables_update_admin
-- permite UPDATE de cualquier columna a OWNER/ADMIN).
create or replace function public.trg_tables_kind_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'El tipo de una mesa no se puede cambiar';
  end if;
  return new;
end;
$$;

revoke all on function public.trg_tables_kind_immutable() from public, anon, authenticated;

create trigger tables_kind_immutable
before update of kind on public.tables
for each row execute function public.trg_tables_kind_immutable();


alter table public.table_sessions
  add column table_kind        public.table_kind not null default 'TABLE',
  add column counter_number    integer,
  add column customer_label    text,
  add column client_request_id uuid;

alter table public.table_sessions
  add constraint table_sessions_table_kind_fkey
    foreign key (table_id, table_kind)
    references public.tables (id, kind)
    on delete cascade,
  add constraint table_sessions_counter_number_check check (
    (table_kind = 'COUNTER' and counter_number is not null and counter_number > 0)
    or (table_kind = 'TABLE' and counter_number is null)
  ),
  add constraint table_sessions_counter_fields_check check (
    table_kind = 'COUNTER'
    or (customer_label is null and client_request_id is null)
  ),
  add constraint table_sessions_customer_label_check check (
    customer_label is null or length(btrim(customer_label)) between 1 and 40
  );

-- Una sesión ACTIVE por mesa, ahora solo para mesas reales. Se crea el
-- nuevo antes de soltar el viejo: nunca hay un instante sin la garantía.
create unique index uq_table_sessions_one_active_table
  on public.table_sessions (table_id)
  where status = 'ACTIVE' and table_kind = 'TABLE';

drop index public.uq_table_sessions_one_active;

-- Correlativo del día: max(counter_number) de las ventas del mostrador
-- iniciadas dentro del día de negocio.
create index idx_table_sessions_counter_day
  on public.table_sessions (table_id, started_at)
  where table_kind = 'COUNTER';

-- Idempotencia de create_counter_sale.
create unique index uq_table_sessions_counter_request
  on public.table_sessions (restaurant_id, client_request_id)
  where client_request_id is not null;
