
-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_options enable row level security;
alter table public.waiter_calls enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: user belongs to restaurant
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

-- Helper: user has specific role
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

-- PROFILES policies
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- RESTAURANTS policies
create policy restaurants_select_members on public.restaurants
  for select to authenticated
  using (public.user_belongs_to_restaurant(id));

create policy restaurants_update_admin on public.restaurants
  for update to authenticated
  using (
    public.user_has_restaurant_role(id, 'OWNER')
    or public.user_has_restaurant_role(id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(id, 'OWNER')
    or public.user_has_restaurant_role(id, 'ADMIN')
  );

-- RESTAURANT MEMBERS policies
create policy restaurant_members_select on public.restaurant_members
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy restaurant_members_insert_admin on public.restaurant_members
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy restaurant_members_update_admin on public.restaurant_members
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

-- TABLES policies
create policy tables_select_members on public.tables
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy tables_insert_admin on public.tables
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy tables_update_admin on public.tables
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

-- CATEGORIES policies
create policy categories_select_members on public.categories
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy categories_insert_admin on public.categories
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy categories_update_admin on public.categories
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy categories_delete_admin on public.categories
  for delete to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

-- PRODUCTS policies
create policy products_select_members on public.products
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

create policy products_insert_admin on public.products
  for insert to authenticated
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy products_update_admin on public.products
  for update to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  )
  with check (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

create policy products_delete_admin on public.products
  for delete to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );

-- PRODUCT OPTIONS policies
create policy product_options_select_members on public.product_options
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.user_belongs_to_restaurant(p.restaurant_id)
    )
  );

-- ORDERS policies (staff only — client uses RPCs)
create policy orders_select_staff on public.orders
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

-- ORDER ITEMS policies
create policy order_items_select_staff on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and public.user_belongs_to_restaurant(o.restaurant_id)
    )
  );

-- WAITER CALLS policies (staff only — client uses RPCs)
create policy waiter_calls_select_staff on public.waiter_calls
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

-- AUDIT LOGS policies
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );
