-- ---------------------------------------------------------------------------
-- Venta de mostrador · C2 · El mostrador no es una mesa.
--
-- Depende de C1. Cada función se redefine COMPLETA partiendo de la versión
-- viva en producción (2026-09-27); el único cambio es el marcado con
-- "-- C2:". Si alguna cambia antes de aplicar esto, re-sincronizar.
--
--   refresh_table_status   no toca el mostrador (su estado no significa
--                          nada y cada venta dispararía un UPDATE/realtime).
--   get_tables_status      rejilla, QR y PDF de mesas: sin el mostrador.
--   get_dashboard_summary  mesas ocupadas / totales: sin el mostrador.
--   resolve_table_qr       el QR del mostrador no abre sesión de cliente.
--   create_staff_order     el mesero no carga pedidos "a la mesa 0".
--   close_table_session    no libera el mostrador (cerraría TODAS las
--                          ventas abiertas); cada venta se cobra o cancela.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_table_status(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_current public.table_status;
  v_kind public.table_kind;
  v_new public.table_status;
begin
  select status, kind into v_current, v_kind
  from public.tables
  where id = p_table_id;

  -- C2: el mostrador no tiene estado de mesa.
  if not found or v_current = 'INACTIVE' or v_kind = 'COUNTER' then
    return;
  end if;

  v_new := public.table_effective_status(p_table_id);

  if v_new is distinct from v_current then
    update public.tables
    set status = v_new
    where id = p_table_id;
  end if;
end;
$$;


create or replace function public.get_tables_status(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
  v_sees_money boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  -- KITCHEN también pertenece al restaurante, pero no ve dinero del cobro.
  v_sees_money := public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
               or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
               or public.user_has_restaurant_role(p_restaurant_id, 'WAITER');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            t.id,
        'number',        t.number,
        'name',          t.name,
        -- Estado calculado en vivo: si la sesión venció por tiempo, la mesa
        -- aparece libre aunque tables.status aún no se haya recalculado.
        'status',        public.table_effective_status(t.id),
        'qr_token',      t.qr_token,
        'active_orders', (
          select count(*)
          from public.orders o
          where o.table_id = t.id
            and o.status in ('PENDING','ACCEPTED','PREPARING','READY')
        ),
        'pending_calls', (
          select count(*)
          from public.waiter_calls wc
          where wc.table_id = t.id
            and wc.status in ('PENDING','ACCEPTED')
        ),
        'active_total', (
          -- Total de la sesión ACTIVE actual (ver migración 045).
          select coalesce(sum(o.total), 0)
          from public.orders o
          join public.table_sessions ts on ts.id = o.table_session_id
          where o.table_id = t.id
            and ts.status = 'ACTIVE'
            and public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
            and o.status not in ('REJECTED', 'CANCELLED')
        ),
        'bill_id',      lb.id,
        'bill_status',  lb.status,
        'bill_balance', case when v_sees_money then lb.balance end
      )
      order by t.number
    ),
    '[]'::jsonb
  )
  into v_result
  from public.tables t
  left join lateral (
    select b.id, b.status, b.balance
    from public.bills b
    join public.table_sessions ts on ts.id = b.table_session_id
    where b.table_id = t.id
      and ts.status = 'ACTIVE'
      and b.status in ('OPEN', 'PAID')
    order by b.opened_at desc
    limit 1
  ) lb on true
  where t.restaurant_id = p_restaurant_id
    and t.kind = 'TABLE';  -- C2

  return v_result;
end;
$$;


create or replace function public.get_dashboard_summary(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  v_today := public.business_today(p_restaurant_id);

  select b.start_at, b.end_at
  into v_start, v_end
  from public.business_day_bounds(p_restaurant_id, v_today, v_today) b;

  select jsonb_build_object(
    'pending_orders',   (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'PENDING'),
    'accepted_orders',  (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'ACCEPTED'),
    'preparing_orders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'PREPARING'),
    'ready_orders',     (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'READY'),
    'pending_calls',    (select count(*) from public.waiter_calls where restaurant_id = p_restaurant_id and status in ('PENDING','ACCEPTED')),
    'occupied_tables',  (select count(*) from public.tables t
                          where t.restaurant_id = p_restaurant_id
                            and t.kind = 'TABLE'  -- C2
                            and t.status <> 'INACTIVE'
                            and public.table_effective_status(t.id) <> 'AVAILABLE'),
    'total_tables',     (select count(*) from public.tables
                          where restaurant_id = p_restaurant_id
                            and kind = 'TABLE'  -- C2
                            and status <> 'INACTIVE'),
    'orders_today',     (select count(*) from public.orders
                          where restaurant_id = p_restaurant_id
                            and created_at >= v_start and created_at < v_end),
    'revenue_today',    (select coalesce(sum(total), 0) from public.orders
                          where restaurant_id = p_restaurant_id
                            and status = 'DELIVERED'
                            and created_at >= v_start and created_at < v_end)
  )
  into v_result;

  return v_result;
end;
$$;


create or replace function public.resolve_table_qr(p_qr_token uuid)
returns table(
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text,
  table_id uuid,
  table_number integer,
  session_token uuid
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table public.tables%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_session public.table_sessions%rowtype;
begin
  -- for update: el candado que hace atómico todo lo que sigue.
  select *
  into v_table
  from public.tables
  where qr_token = p_qr_token
    and status <> 'INACTIVE'
    and kind = 'TABLE'  -- C2: el mostrador no tiene QR de cliente.
  for update;

  if not found then
    raise exception 'QR inválido o mesa no disponible';
  end if;

  select *
  into v_restaurant
  from public.restaurants
  where id = v_table.restaurant_id
    and status = 'ACTIVE';

  if not found then
    raise exception 'Restaurante no disponible';
  end if;

  select ts.*
  into v_session
  from public.table_sessions ts
  where ts.table_id = v_table.id
    and ts.status = 'ACTIVE'
  order by ts.started_at desc
  limit 1;

  if found and v_session.last_activity_at < now() - interval '4 hours' then
    update public.table_sessions
    set status = 'EXPIRED'
    where id = v_session.id;

    v_session := null;
  end if;

  if v_session.id is null then
    insert into public.table_sessions (restaurant_id, table_id)
    values (v_restaurant.id, v_table.id)
    returning * into v_session;
  else
    update public.table_sessions
    set last_activity_at = now()
    where id = v_session.id;
  end if;

  return query
  select
    v_restaurant.id,
    v_restaurant.name,
    v_restaurant.slug,
    v_table.id,
    v_table.number,
    v_session.session_token;
end;
$$;


create or replace function public.create_staff_order(
  p_table_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_notes text;
  v_item_subtotal numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- for update: el mismo candado que usa resolve_table_qr. Sin él, dos meseros
  -- enviando a la vez en la misma mesa podrían crear dos sesiones.
  select *
  into v_table
  from public.tables
  where id = p_table_id
    and status <> 'INACTIVE'
    and kind = 'TABLE'  -- C2: el mostrador vende con create_counter_sale.
  for update;

  if not found then
    raise exception 'Mesa no encontrada o inactiva';
  end if;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para tomar pedidos';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  v_session := public.find_or_create_active_table_session(
    v_table.id,
    v_table.restaurant_id
  );

  -- Los precios se calculan acá, nunca se toman de lo que mande el navegador.
  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and restaurant_id = v_table.restaurant_id
      and active = true
      and available = true;

    if not found then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_item_subtotal := v_product.price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
  end loop;

  insert into public.orders (
    restaurant_id,
    table_id,
    table_session_id,
    status,
    subtotal,
    total,
    notes,
    accepted_by,
    accepted_at,
    preparing_at
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    v_session.id,
    'PREPARING',
    v_subtotal,
    v_subtotal,
    p_notes,
    auth.uid(),
    now(),
    now()
  )
  returning id
  into v_order_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and restaurant_id = v_table.restaurant_id
      and active = true
      and available = true;

    v_quantity := (v_item ->> 'quantity')::integer;
    v_notes := v_item ->> 'notes';

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      notes
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_quantity,
      v_product.price,
      v_product.price * v_quantity,
      v_notes
    );
  end loop;

  -- Mismas dos entradas que deja accept_and_prepare_order: el pedido pasó por
  -- los dos momentos a la vez, y quién lo hizo tiene que quedar registrado.
  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values
    (v_table.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id),
    (v_table.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id);

  -- Si la mesa había llamado al mesero, esa llamada acaba de ser atendida por
  -- definición: él está ahí, tomándole el pedido. Cerrarla sola evita que la
  -- pestaña Solicitudes acumule avisos ya resueltos.
  update public.waiter_calls
  set status = 'ATTENDED',
      handled_by = auth.uid(),
      handled_at = now()
  where table_id = v_table.id
    and type = 'WAITER'
    and status in ('PENDING', 'ACCEPTED');

  return v_order_id;
end;
$$;


create or replace function public.close_table_session(
  p_table_id uuid,
  p_force boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table     public.tables%rowtype;
  v_billing   boolean;
  v_is_admin  boolean;
  v_session   public.table_sessions%rowtype;
  v_bill      public.bills%rowtype;
  v_pending   numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Orden de candados del cobro: mesa -> cuenta -> sesión (ver M8,
  -- lock_bill). Es el mismo candado que usan resolve_table_qr y
  -- create_staff_order: nadie abre sesión en la mesa mientras se cierra.
  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada';
  end if;

  v_is_admin := public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN');

  if not (v_is_admin or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')) then
    raise exception 'No autorizado para liberar mesas';
  end if;

  -- C2: liberar el mostrador cerraría todas las ventas abiertas a la vez.
  if v_table.kind = 'COUNTER' then
    raise exception 'El mostrador no se libera como una mesa: cobra o cancela cada venta';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_table_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    raise exception 'La mesa tiene pedidos activos';
  end if;

  select coalesce(billing_enabled, false) into v_billing
  from public.restaurants
  where id = v_table.restaurant_id;

  if v_billing then
    for v_session in
      select * from public.table_sessions
      where table_id = p_table_id
        and status = 'ACTIVE'
    loop
      -- Cuenta antes que sesión, igual que record_payment -> finalize_bill.
      select * into v_bill
      from public.bills
      where table_session_id = v_session.id
        and status in ('OPEN', 'PAID')
      for update;

      if found then
        v_bill := public.recompute_bill(v_bill.id);
      end if;

      if v_bill.id is not null and v_bill.status = 'PAID' then
        -- Pagada: cierre normal (cierra cuenta, sesión y llamadas).
        perform public.finalize_bill(v_bill.id, auth.uid());
        continue;
      end if;

      if v_bill.id is not null then
        v_pending := v_bill.balance;
      else
        select coalesce(sum(o.total), 0) into v_pending
        from public.orders o
        where o.table_session_id = v_session.id
          and o.status not in ('REJECTED', 'CANCELLED');
      end if;

      if v_pending > 0 then
        if not coalesce(p_force, false) then
          raise exception 'La mesa tiene % pendiente de cobro. Cobra la cuenta o fuerza el cierre.', v_pending;
        end if;

        if not v_is_admin then
          raise exception 'Solo el dueño o un administrador pueden forzar el cierre de una mesa con saldo';
        end if;

        if length(btrim(coalesce(p_reason, ''))) < 3 then
          raise exception 'Escribe el motivo del cierre forzado (mínimo 3 caracteres)';
        end if;

        insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
        values (
          v_table.restaurant_id, auth.uid(), 'FORCE_CLOSE_SESSION', 'TABLE_SESSION', v_session.id,
          jsonb_build_object(
            'table_id', p_table_id,
            'bill_id', v_bill.id,
            'pending', v_pending,
            'reason', btrim(p_reason)
          )
        );
      end if;

      update public.table_sessions
      set status = 'CLOSED',
          closed_at = now()
      where id = v_session.id
        and status = 'ACTIVE';

      v_bill := null;
    end loop;
  else
    update public.table_sessions
    set status = 'CLOSED',
        closed_at = now()
    where table_id = p_table_id
      and status = 'ACTIVE';
  end if;

  update public.waiter_calls
  set status = 'ATTENDED',
      handled_by = auth.uid(),
      handled_at = now()
  where table_id = p_table_id
    and type = 'BILL'
    and status in ('PENDING', 'ACCEPTED');

  perform public.refresh_table_status(p_table_id);
end;
$$;
