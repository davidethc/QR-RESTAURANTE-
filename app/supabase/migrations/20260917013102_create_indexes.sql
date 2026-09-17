-- Indexes for table_sessions
create index idx_table_sessions_table
  on public.table_sessions (table_id);

create index idx_table_sessions_restaurant
  on public.table_sessions (restaurant_id);

create index idx_table_sessions_token
  on public.table_sessions (session_token);

create index idx_table_sessions_status
  on public.table_sessions (status);

-- Indexes for restaurant_members
create index idx_restaurant_members_restaurant
  on public.restaurant_members (restaurant_id);

create index idx_restaurant_members_user
  on public.restaurant_members (user_id);

create index idx_restaurant_members_role
  on public.restaurant_members (restaurant_id, role);

-- Indexes for tables
create index idx_tables_restaurant
  on public.tables (restaurant_id);

create index idx_tables_restaurant_status
  on public.tables (restaurant_id, status);

create index idx_tables_qr_token
  on public.tables (qr_token);

-- Indexes for categories
create index idx_categories_restaurant
  on public.categories (restaurant_id);

create index idx_categories_active_position
  on public.categories (restaurant_id, active, position);

-- Indexes for products
create index idx_products_restaurant
  on public.products (restaurant_id);

create index idx_products_restaurant_category
  on public.products (restaurant_id, category_id);

create index idx_products_restaurant_available
  on public.products (restaurant_id, available);

create index idx_products_active_position
  on public.products (restaurant_id, active, position);

-- Indexes for orders
create index idx_orders_restaurant
  on public.orders (restaurant_id);

create index idx_orders_restaurant_status
  on public.orders (restaurant_id, status);

create index idx_orders_restaurant_created
  on public.orders (restaurant_id, created_at desc);

create index idx_orders_table
  on public.orders (table_id);

create index idx_orders_session
  on public.orders (table_session_id);

-- Indexes for order_items
create index idx_order_items_order
  on public.order_items (order_id);

create index idx_order_items_product
  on public.order_items (product_id);

-- Indexes for waiter_calls
create index idx_waiter_calls_restaurant
  on public.waiter_calls (restaurant_id);

create index idx_waiter_calls_status
  on public.waiter_calls (restaurant_id, status);

create index idx_waiter_calls_table
  on public.waiter_calls (table_id);
