-- ---------------------------------------------------------------------------
-- Módulo 1 · M9 · RPCs de caja.
--
-- Depende de M4 (audit_action OPEN_CASH_SESSION, CLOSE_CASH_SESSION,
-- CASH_MOVEMENT), M5 (billing_enabled) y M6.
--
--   open_cash_session(register, opening_float)          OWNER, ADMIN, WAITER
--   add_cash_movement(session, type, reason, amount,
--                     description, idempotency_key)     OWNER, ADMIN
--   get_cash_session_summary(session)                   OWNER/ADMIN todo;
--                                                       WAITER sin esperados
--   close_cash_session(session, counts, notes)          OWNER, ADMIN, WAITER
--                                                       (ciego para WAITER)
--
-- Cierre ciego antes y después de cerrar: esperados, conteos y diferencias
-- se guardan SOLO en cash_session_counts (una fila por método, RLS
-- OWNER/ADMIN). cash_sessions no los tiene. Los totales los arma
-- get_cash_session_summary solo para OWNER/ADMIN.
--
-- Esperado por método:
--   CASH  = fondo + Σ(amount + tip) de pagos CASH COMPLETED + IN − OUT
--   otros = Σ(amount + tip) de pagos COMPLETED de ese método
-- (el vuelto sale del efectivo entregado, así que no resta).
-- ---------------------------------------------------------------------------

-- Interna: esperado por método de un turno de caja.
create or replace function public.cash_session_expected(p_cash_session_id uuid)
returns table (method public.payment_method, expected numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    m.method,
    round(
      coalesce((
        select sum(p.amount + p.tip_amount)
        from public.payments p
        where p.cash_session_id = p_cash_session_id
          and p.status = 'COMPLETED'
          and p.method = m.method
      ), 0)
      + case when m.method = 'CASH' then
          cs.opening_float
          + coalesce((
              select sum(case when cm.type = 'IN' then cm.amount else -cm.amount end)
              from public.cash_movements cm
              where cm.cash_session_id = p_cash_session_id
            ), 0)
        else 0 end,
      2
    ) as expected
  from unnest(enum_range(null::public.payment_method)) as m(method)
  cross join public.cash_sessions cs
  where cs.id = p_cash_session_id;
$$;

revoke all on function public.cash_session_expected(uuid) from public, anon, authenticated;


create or replace function public.open_cash_session(
  p_register_id uuid,
  p_opening_float numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_register public.cash_registers%rowtype;
  v_session  public.cash_sessions%rowtype;
  v_float    numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_register_id
  for update;

  if not found then
    raise exception 'Caja no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_register.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_register.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_register.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para abrir la caja';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_register.restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  if not v_register.active then
    raise exception 'La caja está desactivada';
  end if;

  v_float := round(coalesce(p_opening_float, 0), 2);
  if v_float < 0 then
    raise exception 'El fondo inicial no puede ser negativo';
  end if;

  begin
    insert into public.cash_sessions (restaurant_id, register_id, opened_by, opening_float)
    values (v_register.restaurant_id, v_register.id, auth.uid(), v_float)
    returning * into v_session;
  exception when unique_violation then
    raise exception 'Ya hay una caja abierta';
  end;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_register.restaurant_id, auth.uid(), 'OPEN_CASH_SESSION', 'CASH_SESSION', v_session.id,
    jsonb_build_object('register_id', v_register.id, 'opening_float', v_float)
  );

  return jsonb_build_object(
    'id',            v_session.id,
    'register_id',   v_session.register_id,
    'register_name', v_register.name,
    'status',        v_session.status,
    'opened_by',     v_session.opened_by,
    'opened_at',     v_session.opened_at,
    'opening_float', v_session.opening_float
  );
end;
$$;

revoke all on function public.open_cash_session(uuid, numeric) from public;
revoke execute on function public.open_cash_session(uuid, numeric) from anon;
grant execute on function public.open_cash_session(uuid, numeric) to authenticated, service_role;


create or replace function public.add_cash_movement(
  p_cash_session_id uuid,
  p_type public.cash_movement_type,
  p_reason public.cash_movement_reason,
  p_amount numeric,
  p_description text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_movement public.cash_movements%rowtype;
  v_amount   numeric(10,2);
  v_cash     numeric;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id
  for update;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_session.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_session.restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador registran movimientos de caja';
  end if;

  -- Reintento con la misma clave: devuelve el movimiento ya registrado.
  select * into v_movement
  from public.cash_movements
  where restaurant_id = v_session.restaurant_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_movement.cash_session_id <> v_session.id then
      raise exception 'La clave de idempotencia ya se usó en otro movimiento';
    end if;
    return to_jsonb(v_movement) || jsonb_build_object('replayed', true);
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'La caja ya está cerrada';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  if p_type is null or p_reason is null then
    raise exception 'Falta el tipo o el motivo del movimiento';
  end if;

  if p_reason = 'OTHER' and length(btrim(coalesce(p_description, ''))) < 3 then
    raise exception 'Describe el motivo del movimiento';
  end if;

  if p_type = 'OUT' then
    select expected into v_cash
    from public.cash_session_expected(v_session.id)
    where method = 'CASH';

    if v_amount > coalesce(v_cash, 0) then
      raise exception 'No hay suficiente efectivo en caja (disponible: %)', coalesce(v_cash, 0);
    end if;
  end if;

  insert into public.cash_movements (
    restaurant_id, cash_session_id, type, reason, amount, description,
    idempotency_key, created_by
  )
  values (
    v_session.restaurant_id, v_session.id, p_type, p_reason, v_amount,
    nullif(btrim(coalesce(p_description, '')), ''),
    p_idempotency_key, auth.uid()
  )
  returning * into v_movement;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.restaurant_id, auth.uid(), 'CASH_MOVEMENT', 'CASH_MOVEMENT', v_movement.id,
    jsonb_build_object(
      'cash_session_id', v_session.id,
      'type', p_type, 'reason', p_reason, 'amount', v_amount
    )
  );

  return to_jsonb(v_movement) || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.add_cash_movement(uuid, public.cash_movement_type, public.cash_movement_reason, numeric, text, uuid) from public;
revoke execute on function public.add_cash_movement(uuid, public.cash_movement_type, public.cash_movement_reason, numeric, text, uuid) from anon;
grant execute on function public.add_cash_movement(uuid, public.cash_movement_type, public.cash_movement_reason, numeric, text, uuid) to authenticated, service_role;


create or replace function public.get_cash_session_summary(p_cash_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_is_admin boolean;
  v_base     jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  v_is_admin := public.user_has_restaurant_role(v_session.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_session.restaurant_id, 'ADMIN');

  if not (v_is_admin or public.user_has_restaurant_role(v_session.restaurant_id, 'WAITER')) then
    raise exception 'No autorizado';
  end if;

  v_base := jsonb_build_object(
    'id',             v_session.id,
    'register_id',    v_session.register_id,
    'register_name',  (select name from public.cash_registers where id = v_session.register_id),
    'status',         v_session.status,
    'opened_by',      v_session.opened_by,
    'opened_at',      v_session.opened_at,
    'opening_float',  v_session.opening_float,
    'closed_by',      v_session.closed_by,
    'closed_at',      v_session.closed_at,
    'payments_count', (
      select count(*) from public.payments
      where cash_session_id = v_session.id and status = 'COMPLETED'
    ),
    'can_see_expected', v_is_admin
  );

  -- Cierre ciego: el mesero no ve esperados, conteos ni diferencias.
  if not v_is_admin then
    return v_base;
  end if;

  return v_base || jsonb_build_object(
    'notes',           v_session.notes,
    -- Cerrado: lo congelado en cash_session_counts. Abierto: en vivo.
    'expected_cash',   coalesce(
                         (select c.expected from public.cash_session_counts c
                          where c.cash_session_id = v_session.id and c.method = 'CASH'),
                         (select e.expected from public.cash_session_expected(v_session.id) e where e.method = 'CASH')
                       ),
    'counted_cash',    (select c.counted from public.cash_session_counts c
                        where c.cash_session_id = v_session.id and c.method = 'CASH'),
    'cash_difference', (select c.difference from public.cash_session_counts c
                        where c.cash_session_id = v_session.id and c.method = 'CASH'),
    'expected_total',  coalesce(
                         (select sum(c.expected) from public.cash_session_counts c
                          where c.cash_session_id = v_session.id),
                         (select sum(e.expected) from public.cash_session_expected(v_session.id) e)
                       ),
    'counted_total',   (select sum(c.counted) from public.cash_session_counts c
                        where c.cash_session_id = v_session.id),
    'difference_total', (select sum(c.difference) from public.cash_session_counts c
                         where c.cash_session_id = v_session.id),
    'by_method', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'method',     e.method,
          'expected',   coalesce(c.expected, e.expected),
          'counted',    c.counted,
          'difference', c.difference,
          'payments_total', coalesce((
            select sum(p.amount) from public.payments p
            where p.cash_session_id = v_session.id and p.status = 'COMPLETED' and p.method = e.method
          ), 0),
          'tips_total', coalesce((
            select sum(p.tip_amount) from public.payments p
            where p.cash_session_id = v_session.id and p.status = 'COMPLETED' and p.method = e.method
          ), 0)
        )
        order by e.method
      )
      from public.cash_session_expected(v_session.id) e
      left join public.cash_session_counts c
        on c.cash_session_id = v_session.id and c.method = e.method
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cm.id, 'type', cm.type, 'reason', cm.reason, 'amount', cm.amount,
          'description', cm.description, 'created_by', cm.created_by, 'created_at', cm.created_at
        )
        order by cm.created_at
      )
      from public.cash_movements cm
      where cm.cash_session_id = v_session.id
    ), '[]'::jsonb),
    'voided_payments_count', (
      select count(*) from public.payments
      where cash_session_id = v_session.id and status = 'VOIDED'
    )
  );
end;
$$;

revoke all on function public.get_cash_session_summary(uuid) from public;
revoke execute on function public.get_cash_session_summary(uuid) from anon;
grant execute on function public.get_cash_session_summary(uuid) to authenticated, service_role;


-- p_counts: {"CASH": 120.50, "CARD": 45.00, ...}. CASH es obligatorio; los
-- demás métodos son opcionales (sin conteo quedan counted/difference nulos).
create or replace function public.close_cash_session(
  p_cash_session_id uuid,
  p_counts jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_is_admin boolean;
  v_key      text;
  v_counted  numeric(10,2);
  v_cash_expected numeric(10,2);
  v_cash_counted  numeric(10,2);
  r record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id
  for update;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  v_is_admin := public.user_has_restaurant_role(v_session.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_session.restaurant_id, 'ADMIN');

  if not (v_is_admin or public.user_has_restaurant_role(v_session.restaurant_id, 'WAITER')) then
    raise exception 'No autorizado para cerrar la caja';
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'La caja ya está cerrada';
  end if;

  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'Conteo inválido';
  end if;

  for v_key in select jsonb_object_keys(p_counts) loop
    if v_key not in (select unnest(enum_range(null::public.payment_method))::text) then
      raise exception 'Método de pago desconocido en el conteo: %', v_key;
    end if;
    if jsonb_typeof(p_counts -> v_key) <> 'number' or (p_counts ->> v_key)::numeric < 0 then
      raise exception 'Conteo inválido para %', v_key;
    end if;
  end loop;

  if not (p_counts ? 'CASH') then
    raise exception 'Falta el conteo de efectivo';
  end if;

  for r in select * from public.cash_session_expected(v_session.id) loop
    v_counted := case
      when p_counts ? r.method::text then round((p_counts ->> r.method::text)::numeric, 2)
      else null
    end;

    if r.method = 'CASH' then
      v_cash_expected := r.expected;
      v_cash_counted  := v_counted;
    end if;

    -- Una fila por método, aunque no haya movimiento (snapshot completo).
    insert into public.cash_session_counts (
      cash_session_id, method, restaurant_id, expected, counted, difference
    )
    values (
      v_session.id, r.method, v_session.restaurant_id, r.expected, v_counted,
      case when v_counted is null then null else v_counted - r.expected end
    );
  end loop;

  update public.cash_sessions
  set status          = 'CLOSED',
      closed_by       = auth.uid(),
      closed_at       = now(),
      notes           = nullif(btrim(coalesce(p_notes, '')), '')
  where id = v_session.id
  returning * into v_session;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.restaurant_id, auth.uid(), 'CLOSE_CASH_SESSION', 'CASH_SESSION', v_session.id,
    jsonb_build_object(
      'expected_cash', v_cash_expected,
      'counted_cash', v_cash_counted,
      'cash_difference', v_cash_counted - v_cash_expected,
      'counts', p_counts
    )
  );

  if v_is_admin then
    return public.get_cash_session_summary(v_session.id);
  end if;

  return jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'closed_at', v_session.closed_at,
    'can_see_expected', false
  );
end;
$$;

revoke all on function public.close_cash_session(uuid, jsonb, text) from public;
revoke execute on function public.close_cash_session(uuid, jsonb, text) from anon;
grant execute on function public.close_cash_session(uuid, jsonb, text) to authenticated, service_role;
