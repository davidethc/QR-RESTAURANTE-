-- ---------------------------------------------------------------------------
-- Módulo 2 · M15 · RPCs de reportes operativos.
--
-- Depende de M1 (hora local), M13 (índice orders accepted_at/ready_at),
-- M14 (report_guard: auth, OWNER/ADMIN, rango ≤ 400 días, límites locales) y
-- C1/C3 del mostrador (tables.kind, table_sessions.counter_number y
-- customer_label, place_label).
--
--   report_peak_hours  → pedidos por día de la semana × hora local
--   report_prep_times  → tiempos por etapa (promedio, p50, p90), sin > 3 h
--   report_discounts   → detalle de descuentos vigentes aplicados en el rango
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- report_peak_hours: pedidos creados en el rango (sin REJECTED/CANCELLED).
-- isodow (1 = lunes … 7 = domingo) es el del DÍA COMERCIAL, y hour es la
-- hora local de reloj: un pedido del sábado 01:00 con corte 04:00 cae en
-- (viernes, 1). Solo devuelve celdas con datos.
-- ---------------------------------------------------------------------------
create or replace function public.report_peak_hours(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  isodow smallint,
  hour smallint,
  orders_count bigint,
  items_count bigint,
  orders_total numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
  v_tz text;
  v_cutoff interval;
begin
  select g.start_at, g.end_at, g.tz, g.cutoff::interval
  into v_start, v_end, v_tz, v_cutoff
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  with o as (
    select x.id,
           x.total,
           (x.created_at at time zone v_tz) as local_ts
    from public.orders x
    where x.restaurant_id = p_restaurant_id
      and x.status not in ('REJECTED', 'CANCELLED')
      and x.created_at >= v_start and x.created_at < v_end
  ),
  items as (
    select oi.order_id, sum(oi.quantity)::bigint as qty
    from public.order_items oi
    where oi.order_id in (select o.id from o)
    group by oi.order_id
  )
  select extract(isodow from (o.local_ts - v_cutoff))::smallint,
         extract(hour from o.local_ts)::smallint,
         count(*)::bigint,
         coalesce(sum(items.qty), 0)::bigint,
         coalesce(sum(o.total), 0)::numeric
  from o
  left join items on items.order_id = o.id
  group by 1, 2
  order by 1, 2;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_prep_times: una fila por etapa, sobre pedidos aceptados en el rango.
--   accept   = created_at  → accepted_at
--   prep     = accepted_at → ready_at
--   delivery = ready_at    → delivered_at
--   total    = created_at  → delivered_at
-- Duraciones negativas o de más de 3 h se descartan (discarded_count).
-- Minutos con 2 decimales.
-- ---------------------------------------------------------------------------
create or replace function public.report_prep_times(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  stage text,
  orders_count bigint,
  discarded_count bigint,
  avg_minutes numeric,
  p50_minutes numeric,
  p90_minutes numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select g.start_at, g.end_at
  into v_start, v_end
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  with durations as (
    -- Espera de aceptación: todos los aceptados en el rango.
    select 1 as ord, 'accept'::text as stage,
           extract(epoch from (x.accepted_at - x.created_at)) as secs
    from public.orders x
    where x.restaurant_id = p_restaurant_id
      and x.accepted_at >= v_start and x.accepted_at < v_end
    union all
    -- Resto de etapas: aceptados en el rango que llegaron a READY
    -- (usa orders_restaurant_accepted_ready_idx).
    select s.ord, s.stage, s.secs
    from public.orders x
    cross join lateral (values
      (2, 'prep'::text,     extract(epoch from (x.ready_at - x.accepted_at))),
      (3, 'delivery'::text, extract(epoch from (x.delivered_at - x.ready_at))),
      (4, 'total'::text,    extract(epoch from (x.delivered_at - x.created_at)))
    ) as s(ord, stage, secs)
    where x.restaurant_id = p_restaurant_id
      and x.ready_at is not null
      and x.accepted_at >= v_start and x.accepted_at < v_end
      and s.secs is not null
  ),
  stages(ord, stage) as (
    values (1, 'accept'::text), (2, 'prep'::text), (3, 'delivery'::text), (4, 'total'::text)
  )
  select st.stage,
         count(d.secs) filter (where d.secs between 0 and 10800)::bigint,
         count(d.secs) filter (where d.secs < 0 or d.secs > 10800)::bigint,
         round((avg(d.secs) filter (where d.secs between 0 and 10800) / 60)::numeric, 2),
         round((percentile_cont(0.5) within group (order by d.secs)
                  filter (where d.secs between 0 and 10800) / 60)::numeric, 2),
         round((percentile_cont(0.9) within group (order by d.secs)
                  filter (where d.secs between 0 and 10800) / 60)::numeric, 2)
  from stages st
  left join durations d on d.stage = st.stage
  group by st.ord, st.stage
  order by st.ord;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_discounts: descuentos vigentes (no removidos) aplicados en el rango
-- sobre cuentas no anuladas. bill_status permite al front separar los que ya
-- impactan venta neta (CLOSED) de los de cuentas aún abiertas.
-- place_label: "Mesa 4" o "Para llevar #12 · Ana" (el mostrador tiene
-- table_number = 0; el front debe mostrar place_label, no el número).
-- ---------------------------------------------------------------------------
create or replace function public.report_discounts(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  discount_id uuid,
  applied_at timestamptz,
  business_date date,
  bill_id uuid,
  bill_number bigint,
  bill_status public.bill_status,
  table_number integer,
  table_name text,
  place_label text,
  kind public.discount_kind,
  value numeric,
  amount numeric,
  reason text,
  order_item_id uuid,
  product_name text,
  applied_by uuid,
  applied_by_name text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
  v_tz text;
  v_cutoff interval;
begin
  select g.start_at, g.end_at, g.tz, g.cutoff::interval
  into v_start, v_end, v_tz, v_cutoff
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  select bd.id,
         bd.applied_at,
         ((bd.applied_at at time zone v_tz) - v_cutoff)::date,
         b.id,
         b.bill_number,
         b.status,
         t.number,
         t.name,
         public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label),
         bd.kind,
         bd.value,
         bd.amount,
         bd.reason,
         bd.order_item_id,
         oi.product_name,
         bd.applied_by,
         coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre')
  from public.bill_discounts bd
  join public.bills b on b.id = bd.bill_id
  left join public.tables t on t.id = b.table_id
  left join public.table_sessions ts on ts.id = b.table_session_id
  left join public.order_items oi on oi.id = bd.order_item_id
  left join public.profiles pr on pr.id = bd.applied_by
  where bd.restaurant_id = p_restaurant_id
    and bd.removed_at is null
    and b.status <> 'VOID'
    and bd.applied_at >= v_start and bd.applied_at < v_end
  order by bd.applied_at desc;
end;
$$;


revoke all on function public.report_peak_hours(uuid, date, date) from public;
revoke all on function public.report_prep_times(uuid, date, date) from public;
revoke all on function public.report_discounts(uuid, date, date) from public;

revoke execute on function public.report_peak_hours(uuid, date, date) from anon;
revoke execute on function public.report_prep_times(uuid, date, date) from anon;
revoke execute on function public.report_discounts(uuid, date, date) from anon;

grant execute on function public.report_peak_hours(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_prep_times(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_discounts(uuid, date, date) to authenticated, service_role;
