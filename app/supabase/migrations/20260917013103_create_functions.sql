-- Function: set_updated_at() - automatically update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Function: handle_new_user() - create profile when auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

-- Function: user_belongs_to_restaurant() - check if user belongs to restaurant
create or replace function public.user_belongs_to_restaurant(
  target_restaurant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = target_restaurant_id
      and rm.user_id = auth.uid()
      and rm.status = 'ACTIVE'
  );
$$;

-- Function: user_has_restaurant_role() - check if user has specific role in restaurant
create or replace function public.user_has_restaurant_role(
  target_restaurant_id uuid,
  target_role public.member_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = target_restaurant_id
      and rm.user_id = auth.uid()
      and rm.role = target_role
      and rm.status = 'ACTIVE'
  );
$$;

-- Function: resolve_table_qr() - resolve QR token to session
create or replace function public.resolve_table_qr(
  p_qr_token uuid
)
returns table (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text,
  table_id uuid,
  table_number integer,
  session_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.tables%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_session public.table_sessions%rowtype;
begin

  select *
  into v_table
  from public.tables
  where qr_token = p_qr_token
    and status <> 'INACTIVE';

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

  insert into public.table_sessions (
    restaurant_id,
    table_id
  )
  values (
    v_restaurant.id,
    v_table.id
  )
  returning *
  into v_session;

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

-- Function: create_customer_order() - create order from customer cart
create or replace function public.create_customer_order(
  p_session_token uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.table_sessions%rowtype;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_notes text;
  v_item_subtotal numeric(10,2);
begin

  select *
  into v_session
  from public.table_sessions
  where session_token = p_session_token
    and status = 'ACTIVE';

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  -- Validate all products and calculate subtotal
  for v_item in
    select *
    from jsonb_array_elements(p_items)
  loop

    v_quantity := (v_item ->> 'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and restaurant_id = v_session.restaurant_id
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
    notes
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    'PENDING',
    v_subtotal,
    v_subtotal,
    p_notes
  )
  returning id
  into v_order_id;

  -- Create order items with historical snapshot
  for v_item in
    select *
    from jsonb_array_elements(p_items)
  loop

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and restaurant_id = v_session.restaurant_id
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

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_order_id;
end;
$$;

-- Function: get_customer_order() - get order status for customer
create or replace function public.get_customer_order(
  p_session_token uuid,
  p_order_id uuid
)
returns table (
  order_id uuid,
  order_number bigint,
  status public.order_status,
  subtotal numeric,
  total numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.status,
    o.subtotal,
    o.total,
    o.created_at
  from public.orders o
  join public.table_sessions ts
    on ts.id = o.table_session_id
  where ts.session_token = p_session_token
    and o.id = p_order_id;
$$;

-- Function: create_waiter_call() - create waiter/bill request
create or replace function public.create_waiter_call(
  p_session_token uuid,
  p_type public.waiter_call_type
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.table_sessions%rowtype;
  v_call_id uuid;
begin

  select *
  into v_session
  from public.table_sessions
  where session_token = p_session_token
    and status = 'ACTIVE';

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  -- Check for existing pending call of same type
  if exists (
    select 1
    from public.waiter_calls
    where table_id = v_session.table_id
      and type = p_type
      and status = 'PENDING'
  ) then
    raise exception 'Ya existe una solicitud pendiente de este tipo';
  end if;

  insert into public.waiter_calls (
    restaurant_id,
    table_id,
    table_session_id,
    type,
    status
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    p_type,
    'PENDING'
  )
  returning id
  into v_call_id;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_call_id;
end;
$$;

-- Triggers for updated_at
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger restaurants_set_updated_at
before update on public.restaurants
for each row
execute function public.set_updated_at();

create trigger restaurant_members_set_updated_at
before update on public.restaurant_members
for each row
execute function public.set_updated_at();

create trigger tables_set_updated_at
before update on public.tables
for each row
execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

create trigger product_options_set_updated_at
before update on public.product_options
for each row
execute function public.set_updated_at();

create trigger product_option_values_set_updated_at
before update on public.product_option_values
for each row
execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

create trigger waiter_calls_set_updated_at
before update on public.waiter_calls
for each row
execute function public.set_updated_at();

-- Trigger for creating profile on new auth user
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
