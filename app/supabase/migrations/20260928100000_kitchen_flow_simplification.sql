-- Simplificación del flujo de cocina (plan cocina, opción C, Fase 1).
--
-- 1. restaurants.kitchen_ready_step: interruptor por restaurante.
--      true  = la cocina marca "Listo" con un toque (default para restaurantes nuevos).
--      false = la cocina solo mira; la base rechaza mark_order_ready del rol KITCHEN.
--    Omm Siri arranca en false por decisión del dueño (UPDATE explícito al final).
-- 2. mark_order_delivered: se puede entregar desde ACCEPTED/PREPARING/READY, sin
--    exigir READY. No rellena ready_at (inventaría tiempos de cocina de 0 s).
--    Auditoría con metadata.from_status.
-- 3. mark_order_ready: acepta ACCEPTED/PREPARING; con kitchen_ready_step=false
--    solo OWNER/ADMIN puede marcar "Listo" (todo el resto del personal, incluido
--    WAITER, queda fuera para que el interruptor sea real: nadie genera ready_at
--    saltándose la interfaz).
-- 4. report_prep_times: la etapa total (created -> delivered) cuenta todo pedido
--    entregado, tenga o no ready_at. prep y delivery siguen exigiendo ready_at.
--
-- Sin cambios en el enum order_status ni audit_action (MARK_ORDER_READY y
-- MARK_ORDER_DELIVERED ya existen). No hay CHECK ni trigger de transición de
-- estados en orders: PREPARING -> DELIVERED no choca con ninguna restricción.
-- El orden de candados de mark_order_delivered no cambia (pedido FOR UPDATE ->
-- trigger trg_orders_recompute_bill -> mesa -> cuenta), así que el cierre
-- automático de cuenta pagada (20260927130300) sigue igual.

-- 1. Interruptor por restaurante -------------------------------------------------

alter table public.restaurants
  add column if not exists kitchen_ready_step boolean not null default true;

comment on column public.restaurants.kitchen_ready_step is
  'true: la cocina marca "Listo" (se miden tiempos de cocina y se avisa al mesero/cliente). '
  'false: la cocina solo ve las comandas; mark_order_ready rechaza a todo el personal salvo OWNER/ADMIN y el mesero entrega desde "En cocina".';

-- 2. mark_order_delivered ----------------------------------------------------------

create or replace function public.mark_order_delivered(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para entregar pedidos';
  end if;

  if v_order.status not in ('ACCEPTED', 'PREPARING', 'READY') then
    raise exception 'El pedido no se puede entregar (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'DELIVERED',
      delivered_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_order.restaurant_id, auth.uid(), 'MARK_ORDER_DELIVERED', 'ORDER', p_order_id,
    jsonb_build_object('from_status', v_order.status)
  );
end;
$$;

revoke all on function public.mark_order_delivered(uuid) from public;
revoke execute on function public.mark_order_delivered(uuid) from anon;
grant execute on function public.mark_order_delivered(uuid) to authenticated, service_role;

-- 3. mark_order_ready --------------------------------------------------------------

create or replace function public.mark_order_ready(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order        public.orders%rowtype;
  v_is_admin     boolean;
  v_is_kitchen   boolean;
  v_is_waiter    boolean;
  v_ready_step   boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  v_is_admin := public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN');
  v_is_kitchen := public.user_has_restaurant_role(v_order.restaurant_id, 'KITCHEN');
  v_is_waiter := public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER');

  if not (v_is_admin or v_is_kitchen or v_is_waiter) then
    raise exception 'No autorizado para marcar pedidos como listos';
  end if;

  if not v_is_admin then
    select r.kitchen_ready_step into v_ready_step
    from public.restaurants r
    where r.id = v_order.restaurant_id;

    if not coalesce(v_ready_step, true) then
      raise exception 'La cocina de este restaurante trabaja en modo solo lectura';
    end if;
  end if;

  if v_order.status not in ('ACCEPTED', 'PREPARING') then
    raise exception 'El pedido debe estar en cocina (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'READY',
      preparing_at = coalesce(preparing_at, now()),
      ready_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_order.restaurant_id, auth.uid(), 'MARK_ORDER_READY', 'ORDER', p_order_id,
    jsonb_build_object('from_status', v_order.status)
  );
end;
$$;

revoke all on function public.mark_order_ready(uuid) from public;
revoke execute on function public.mark_order_ready(uuid) from anon;
grant execute on function public.mark_order_ready(uuid) to authenticated, service_role;

-- 4. report_prep_times -------------------------------------------------------------

create index if not exists orders_restaurant_accepted_delivered_idx
  on public.orders (restaurant_id, accepted_at)
  where delivered_at is not null;

create or replace function public.report_prep_times(p_restaurant_id uuid, p_from date, p_to date)
returns table(
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
    -- Cocina y pase: solo pedidos que la cocina marcó Listo
    -- (usa orders_restaurant_accepted_ready_idx).
    select s.ord, s.stage, s.secs
    from public.orders x
    cross join lateral (values
      (2, 'prep'::text,     extract(epoch from (x.ready_at - x.accepted_at))),
      (3, 'delivery'::text, extract(epoch from (x.delivered_at - x.ready_at)))
    ) as s(ord, stage, secs)
    where x.restaurant_id = p_restaurant_id
      and x.ready_at is not null
      and x.accepted_at >= v_start and x.accepted_at < v_end
      and s.secs is not null
    union all
    -- Total: todo pedido entregado, haya pasado o no por Listo
    -- (usa orders_restaurant_accepted_delivered_idx).
    select 4, 'total'::text,
           extract(epoch from (x.delivered_at - x.created_at))
    from public.orders x
    where x.restaurant_id = p_restaurant_id
      and x.delivered_at is not null
      and x.accepted_at >= v_start and x.accepted_at < v_end
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

revoke all on function public.report_prep_times(uuid, date, date) from public;
revoke execute on function public.report_prep_times(uuid, date, date) from anon;
grant execute on function public.report_prep_times(uuid, date, date) to authenticated, service_role;

-- 5. Omm Siri: la cocina solo mira desde el primer día (decisión del dueño, 2026-09-27).

update public.restaurants
set kitchen_ready_step = false
where id = '9d23ed2c-4147-442c-a11d-93f726ab897e';
