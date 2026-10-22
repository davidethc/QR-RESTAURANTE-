-- ---------------------------------------------------------------------------
-- M05 · KDS (comandas digitales de cocina) · EXPAND.
-- Depende de 20261022010000 (tickets) y 20261022040000 (order_item_options.qty).
--
-- Qué agrega (nada existente se borra ni se cambia):
--   a) restaurants.kds_enabled / kds_warn_minutes / kds_alert_minutes
--      (M05-T01). Defaults documentados:
--        kds_enabled        false  (activación explícita; los restaurantes que
--                                   ya tienen pedidos quedan en true para no
--                                   cambiar el /kitchen actual)
--        kds_warn_minutes   10     verde 0-10, amarillo 10-20, rojo > 20
--        kds_alert_minutes  20     (tope visual "+99 mins" lo pinta la UI)
--      RPC set_kds_settings (OWNER/ADMIN) para escribirlos sin abrir UPDATE
--      directo sobre restaurants.
--   b) complete_ticket / return_ticket_to_preparation (OWNER, ADMIN, KITCHEN).
--      Cuentan COMANDAS (tickets), no pedidos. Idempotentes. Auditan en
--      audit_logs (action UPDATE, entity TICKET, metadata.action).
--   c) get_kitchen_tickets: comandas pendientes (o completadas = historial)
--      con líneas, opciones, notas, tipo de servicio, mesa/cliente, autor y
--      hora; pending_count cuenta filas de tickets.
--   d) Trigger orders -> tickets: cuando un pedido pasa a READY/DELIVERED por
--      el flujo actual (mark_order_ready / mark_order_delivered), sus comandas
--      pendientes se completan solas. Así el flujo viejo de /kitchen y el KDS
--      nuevo no se contradicen y la migración M04 (que ya hacía lo mismo al
--      migrar) sigue siendo la regla.
--
-- Rollback: drop function de las 4 RPC, drop trigger orders_complete_tickets,
-- las columnas nuevas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) configuración =================================
alter table public.restaurants
  add column if not exists kds_enabled boolean not null default false,
  add column if not exists kds_warn_minutes integer not null default 10,
  add column if not exists kds_alert_minutes integer not null default 20;

alter table public.restaurants
  drop constraint if exists restaurants_kds_thresholds_valid;
alter table public.restaurants
  add constraint restaurants_kds_thresholds_valid check (
    kds_warn_minutes between 1 and 240
    and kds_alert_minutes between 1 and 240
    and kds_alert_minutes > kds_warn_minutes
  );

comment on column public.restaurants.kds_enabled is 'M05: el módulo de comandas digitales fue activado explícitamente.';
comment on column public.restaurants.kds_warn_minutes is 'M05: minutos a partir de los cuales la comanda pasa de verde a amarillo (default 10).';
comment on column public.restaurants.kds_alert_minutes is 'M05: minutos a partir de los cuales la comanda pasa a rojo (default 20); debe ser mayor que kds_warn_minutes.';

-- Los restaurantes con pedidos ya usan /kitchen: no se les esconde.
update public.restaurants r
set kds_enabled = true
where not r.kds_enabled
  and exists (select 1 from public.orders o where o.restaurant_id = r.id);

create or replace function public.set_kds_settings(
  p_restaurant_id uuid,
  p_enabled boolean default null,
  p_warn_minutes integer default null,
  p_alert_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_r public.restaurants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador configuran las comandas digitales';
  end if;

  select * into v_r from public.restaurants where id = p_restaurant_id for update;
  if not found then
    raise exception 'Restaurante no encontrado';
  end if;

  update public.restaurants
  set kds_enabled = coalesce(p_enabled, kds_enabled),
      kds_warn_minutes = coalesce(p_warn_minutes, kds_warn_minutes),
      kds_alert_minutes = coalesce(p_alert_minutes, kds_alert_minutes)
  where id = p_restaurant_id
  returning * into v_r;
  -- El CHECK de la tabla rechaza umbrales fuera de rango o invertidos.

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
    jsonb_build_object('action', 'SET_KDS_SETTINGS', 'kds_enabled', v_r.kds_enabled,
      'warn_minutes', v_r.kds_warn_minutes, 'alert_minutes', v_r.kds_alert_minutes));

  return jsonb_build_object('kds_enabled', v_r.kds_enabled,
    'warn_minutes', v_r.kds_warn_minutes, 'alert_minutes', v_r.kds_alert_minutes);
end;
$$;

revoke all on function public.set_kds_settings(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.set_kds_settings(uuid, boolean, integer, integer) to authenticated, service_role;

-- ======================= b) completar / devolver ==========================
-- Interna: ticket + pedido bloqueados y rol validado.
create or replace function public.kds_lock_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_id uuid;
  v_order_id uuid;
  v_ticket public.tickets%rowtype;
  v_status public.order_status;
  v_cancelled boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select o.restaurant_id, o.id into v_restaurant_id, v_order_id
  from public.tickets t join public.orders o on o.id = t.order_id
  where t.id = p_ticket_id;

  -- Rol antes que existencia: a quien no es de cocina no se le dice nada.
  if v_restaurant_id is null or not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'KITCHEN')
  ) then
    raise exception 'Comanda no encontrada o sin permiso';
  end if;

  select status, cancelled into v_status, v_cancelled
  from public.orders where id = v_order_id for share;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;

  return jsonb_build_object('restaurant_id', v_restaurant_id, 'order_id', v_order_id,
    'kitchen_status', v_ticket.kitchen_status, 'number', v_ticket.number,
    'order_status', v_status, 'order_cancelled', v_cancelled);
end;
$$;

revoke all on function public.kds_lock_ticket(uuid) from public, anon, authenticated;

create or replace function public.complete_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l jsonb;
  v_pending integer;
begin
  v_l := public.kds_lock_ticket(p_ticket_id);

  if v_l ->> 'kitchen_status' = 'completed' then
    return jsonb_build_object('ticket_id', p_ticket_id, 'kitchen_status', 'completed', 'replayed', true);
  end if;

  if (v_l ->> 'order_cancelled')::boolean or (v_l ->> 'order_status') in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido está cancelado: la comanda ya no se prepara';
  end if;

  update public.tickets
  set kitchen_status = 'completed', completed_at = now(), is_new = false
  where id = p_ticket_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values ((v_l ->> 'restaurant_id')::uuid, auth.uid(), 'UPDATE', 'TICKET', p_ticket_id,
    jsonb_build_object('action', 'COMPLETE_TICKET', 'order_id', v_l ->> 'order_id',
      'ticket_number', (v_l ->> 'number')::integer));

  select count(*) into v_pending from public.tickets
  where order_id = (v_l ->> 'order_id')::uuid and kitchen_status = 'pending';

  return jsonb_build_object('ticket_id', p_ticket_id, 'kitchen_status', 'completed',
    'replayed', false, 'order_pending_tickets', v_pending);
end;
$$;

create or replace function public.return_ticket_to_preparation(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l jsonb;
begin
  v_l := public.kds_lock_ticket(p_ticket_id);

  if v_l ->> 'kitchen_status' = 'pending' then
    return jsonb_build_object('ticket_id', p_ticket_id, 'kitchen_status', 'pending', 'replayed', true);
  end if;

  -- READY/DELIVERED: el pedido ya salió de cocina por el flujo clásico y
  -- reabrirlo es una decisión de mesero/caja (reopen), no de la pantalla.
  if (v_l ->> 'order_cancelled')::boolean
     or (v_l ->> 'order_status') not in ('ACCEPTED', 'PREPARING') then
    raise exception 'El pedido ya no está en cocina: no se puede devolver la comanda';
  end if;

  update public.tickets
  set kitchen_status = 'pending', completed_at = null, is_new = true
  where id = p_ticket_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values ((v_l ->> 'restaurant_id')::uuid, auth.uid(), 'UPDATE', 'TICKET', p_ticket_id,
    jsonb_build_object('action', 'RETURN_TICKET', 'order_id', v_l ->> 'order_id',
      'ticket_number', (v_l ->> 'number')::integer));

  return jsonb_build_object('ticket_id', p_ticket_id, 'kitchen_status', 'pending', 'replayed', false);
end;
$$;

revoke all on function public.complete_ticket(uuid) from public, anon;
revoke all on function public.return_ticket_to_preparation(uuid) from public, anon;
grant execute on function public.complete_ticket(uuid) to authenticated, service_role;
grant execute on function public.return_ticket_to_preparation(uuid) to authenticated, service_role;

-- ======================= c) lectura ========================================
create or replace function public.get_kitchen_tickets(
  p_restaurant_id uuid,
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_pending integer;
  v_total integer;
  v_r public.restaurants%rowtype;
  v_tickets jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(p_restaurant_id, 'KITCHEN')
  ) then
    raise exception 'No autorizado para ver las comandas';
  end if;

  if p_status not in ('pending', 'completed') then
    raise exception 'Estado de comanda inválido';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'El límite debe estar entre 1 y 200';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Desplazamiento inválido';
  end if;

  select * into v_r from public.restaurants where id = p_restaurant_id;

  -- Contador: filas de tickets pendientes de pedidos vivos en cocina.
  select count(*) into v_pending
  from public.tickets t join public.orders o on o.id = t.order_id
  where o.restaurant_id = p_restaurant_id
    and t.kitchen_status = 'pending'
    and not o.cancelled
    and o.status in ('ACCEPTED', 'PREPARING');

  select count(*) into v_total
  from public.tickets t join public.orders o on o.id = t.order_id
  where o.restaurant_id = p_restaurant_id
    and not o.cancelled
    and (p_since is null or t.created_at >= p_since)
    and case when p_status = 'pending'
      then t.kitchen_status = 'pending' and o.status in ('ACCEPTED', 'PREPARING')
      else t.kitchen_status = 'completed' and o.status not in ('REJECTED', 'CANCELLED') end;

  select coalesce(jsonb_agg(x.j order by x.s1, x.s2), '[]'::jsonb) into v_tickets
  from (
    select
      case when p_status = 'pending' then extract(epoch from t.created_at)
           else -extract(epoch from t.completed_at) end as s1,
      t.number as s2,
      jsonb_build_object(
        'ticket_id', t.id,
        'number', t.number,
        'kitchen_status', t.kitchen_status,
        'is_new', t.is_new,
        'created_at', t.created_at,
        'completed_at', t.completed_at,
        'elapsed_seconds', greatest(0, floor(extract(epoch from (coalesce(t.completed_at, now()) - t.created_at)))::integer),
        'order_id', o.id,
        'folio', o.folio,
        'short_code', o.short_code,
        'service_type', o.service_type,
        'order_status', o.status,
        'order_notes', o.notes,
        'place_label', case
          when ts.id is null then 'Mesa ' || tb.number::text
          else public.place_label(ts.table_kind, tb.number, ts.counter_number, ts.customer_label) end,
        'table_number', case when tb.kind = 'TABLE' then tb.number end,
        -- orders.customer_name lo agrega M06; to_jsonb tolera que aún no exista.
        'customer_name', coalesce(
          nullif(btrim(to_jsonb(o) ->> 'customer_name'), ''),
          nullif(btrim(ts.customer_label), '')),
        'author_user_id', t.created_by,
        'author_name', pr.full_name,
        'source', case when t.created_by is null then 'digital_menu' else 'staff' end,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', oi.id,
            'quantity', oi.quantity,
            'product_name', oi.product_name,
            'variant_name', oi.variant_name,
            'notes', oi.notes,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'group', oio.option_name, 'name', oio.value_name, 'qty', oio.qty)
                order by oio.created_at, oio.ctid)
              from public.order_item_options oio where oio.order_item_id = oi.id), '[]'::jsonb)
          ) order by oi.created_at, oi.ctid)
          from public.order_items oi
          where oi.ticket_id = t.id and not oi.cancelled), '[]'::jsonb)
      ) as j
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join public.tables tb on tb.id = o.table_id
    left join public.table_sessions ts on ts.id = o.table_session_id
    left join public.profiles pr on pr.id = t.created_by
    where o.restaurant_id = p_restaurant_id
      and not o.cancelled
      and (p_since is null or t.created_at >= p_since)
      and case when p_status = 'pending'
        then t.kitchen_status = 'pending' and o.status in ('ACCEPTED', 'PREPARING')
        else t.kitchen_status = 'completed' and o.status not in ('REJECTED', 'CANCELLED') end
    order by 1, 2
    limit p_limit offset p_offset
  ) x;

  return jsonb_build_object(
    'pending_count', v_pending,
    'total', v_total,
    'kds_enabled', v_r.kds_enabled,
    'thresholds', jsonb_build_object('warn_minutes', v_r.kds_warn_minutes, 'alert_minutes', v_r.kds_alert_minutes),
    'tickets', v_tickets
  );
end;
$$;

revoke all on function public.get_kitchen_tickets(uuid, text, integer, integer, timestamptz) from public, anon;
grant execute on function public.get_kitchen_tickets(uuid, text, integer, integer, timestamptz) to authenticated, service_role;

create index if not exists tickets_status_created_idx
  on public.tickets (kitchen_status, created_at);

-- ======================= d) sincronía con el flujo clásico =================
create or replace function public.trg_orders_complete_tickets()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status in ('READY', 'DELIVERED') and new.status is distinct from old.status then
    update public.tickets
    set kitchen_status = 'completed', completed_at = now(), is_new = false
    where order_id = new.id and kitchen_status = 'pending';
  end if;
  return null;
end;
$$;

revoke all on function public.trg_orders_complete_tickets() from public, anon, authenticated;

drop trigger if exists orders_complete_tickets on public.orders;
create trigger orders_complete_tickets
after update of status on public.orders
for each row execute function public.trg_orders_complete_tickets();
