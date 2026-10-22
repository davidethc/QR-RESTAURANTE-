-- ---------------------------------------------------------------------------
-- M09 · Tiempo real y contadores del personal · EXPAND.
-- Depende de 20261022010000 (tickets, orders.status_review), 20261022100000
-- (KDS) y 20261021150000 (availability).
--
-- Patrón vigente de Realtime (no se cambia): postgres_changes sobre tablas de
-- la publicación supabase_realtime, filtradas en el cliente por
-- restaurant_id=eq.X y autorizadas por la RLS de cada tabla (SELECT para
-- miembros activos). El broadcast privado (realtime.messages) queda solo para
-- la sesión del cliente QR (session:<sha256>). Esta migración sigue ese patrón.
--
-- Qué agrega:
--   a) tickets.restaurant_id (backfill desde orders + trigger BEFORE INSERT que
--      lo fuerza desde el pedido, nunca del llamador). Sin él Realtime no puede
--      filtrar tickets por restaurante (el payload no trae orders). Política
--      SELECT directa por restaurant_id (más barata que el EXISTS sobre orders
--      que Realtime evalúa por evento y por suscriptor).
--   b) Publicación: public.tickets y public.availability en supabase_realtime,
--      ambas con REPLICA IDENTITY FULL (el DELETE trae restaurant_id).
--      Idempotente: no falla si ya estaban publicadas.
--   c) get_staff_counters(p_restaurant_id): contadores unificados del personal
--      en una sola consulta. Se pide al abrir la pantalla y al reconectar
--      (reconciliación: estado completo, no delta) y cuando llega cualquier
--      evento de orders/tickets/waiter_calls/tables.
--   d) Índices parciales para que el contador sea barato.
--
-- Definiciones de los contadores (por restaurante):
--   active_tables        mesas (kind TABLE, no INACTIVE) cuyo estado efectivo
--                        no es AVAILABLE (table_effective_status).
--   bill_requested       mesas con llamada BILL abierta (PENDING/ACCEPTED).
--   waiter_requested     mesas con llamada WAITER abierta y SIN BILL abierta
--                        (pedir la cuenta limpia "solicitando mesero").
--   unreviewed_tickets   pedidos de mesa con status_review = 'new' (QR del
--                        cliente aún no revisado por el mesero), vivos.
--   tickets_to_prepare   comandas (tickets) pendientes de pedidos
--                        ACCEPTED/PREPARING: la misma regla que get_kitchen_tickets.
--   unreviewed_orders    pedidos web (delivery/pickup/takeaway) con
--                        status_review = 'new', vivos.
--
-- Rollback: alter publication supabase_realtime drop table public.tickets,
-- public.availability; drop function get_staff_counters; las columnas e
-- índices son inofensivos.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) tickets.restaurant_id ===========================
alter table public.tickets
  add column if not exists restaurant_id uuid references public.restaurants (id) on delete restrict;

update public.tickets t
set restaurant_id = o.restaurant_id
from public.orders o
where o.id = t.order_id and t.restaurant_id is null;

alter table public.tickets alter column restaurant_id set not null;

create or replace function public.trg_tickets_set_restaurant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Siempre del pedido: el llamador no decide a qué restaurante pertenece.
  select o.restaurant_id into new.restaurant_id
  from public.orders o where o.id = new.order_id;
  if new.restaurant_id is null then
    raise exception 'Pedido no encontrado para la comanda';
  end if;
  return new;
end;
$$;
revoke all on function public.trg_tickets_set_restaurant() from public, anon, authenticated;

drop trigger if exists tickets_set_restaurant on public.tickets;
create trigger tickets_set_restaurant
before insert or update of order_id on public.tickets
for each row execute function public.trg_tickets_set_restaurant();

create index if not exists tickets_restaurant_pending_idx
  on public.tickets (restaurant_id) where kitchen_status = 'pending';
create index if not exists orders_restaurant_unreviewed_idx
  on public.orders (restaurant_id, service_type) where status_review = 'new';

drop policy if exists tickets_select_restaurant on public.tickets;
create policy tickets_select_restaurant on public.tickets
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

comment on column public.tickets.restaurant_id is
  'M09: restaurante de la comanda (lo fija un trigger desde el pedido). Permite filtrar Realtime por restaurante.';

-- ======================= b) publicación =====================================
alter table public.tickets replica identity full;
alter table public.availability replica identity full;

do $$
declare
  v_t text;
begin
  foreach v_t in array array['tickets', 'availability'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_t);
    end if;
  end loop;
end;
$$;

-- ======================= c) contadores ======================================
create or replace function public.get_staff_counters(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_restaurant_id is null or not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'active_tables', (
      select count(*) from public.tables t
      where t.restaurant_id = p_restaurant_id
        and t.kind = 'TABLE'
        and t.status <> 'INACTIVE'
        and public.table_effective_status(t.id) <> 'AVAILABLE'),
    'bill_requested', (
      select count(distinct wc.table_id) from public.waiter_calls wc
      where wc.restaurant_id = p_restaurant_id
        and wc.type = 'BILL' and wc.status in ('PENDING', 'ACCEPTED')),
    'waiter_requested', (
      select count(distinct wc.table_id) from public.waiter_calls wc
      where wc.restaurant_id = p_restaurant_id
        and wc.type = 'WAITER' and wc.status in ('PENDING', 'ACCEPTED')
        and not exists (
          select 1 from public.waiter_calls b
          where b.table_id = wc.table_id and b.type = 'BILL'
            and b.status in ('PENDING', 'ACCEPTED'))),
    'unreviewed_tickets', (
      select count(*) from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status_review = 'new' and o.service_type = 'table'
        and o.status not in ('REJECTED', 'CANCELLED') and not o.cancelled),
    'tickets_to_prepare', (
      select count(*) from public.tickets t
      join public.orders o on o.id = t.order_id
      where t.restaurant_id = p_restaurant_id
        and t.kitchen_status = 'pending'
        and o.status in ('ACCEPTED', 'PREPARING')),
    'unreviewed_orders', (
      select count(*) from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status_review = 'new' and o.service_type in ('delivery', 'pickup', 'takeaway')
        and o.status not in ('REJECTED', 'CANCELLED') and not o.cancelled),
    'server_time', now()
  );
end;
$$;

revoke all on function public.get_staff_counters(uuid) from public, anon;
grant execute on function public.get_staff_counters(uuid) to authenticated, service_role;
