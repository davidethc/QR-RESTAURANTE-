# DATABASE DESIGN V2 — SCHEMA SQL SEGURO DEL MVP

## 1. Objetivo

Este esquema implementa la base de datos inicial del sistema QR para restaurantes considerando:

- Multi-tenancy.
- Clientes anónimos.
- Sesiones de mesa.
- Pedidos.
- Meseros.
- Cocina.
- Administradores.
- Solicitudes de atención.
- RLS.
- Validaciones server-side.
- Transiciones seguras de pedidos.
- Historial de precios.
- Auditoría.
- Realtime.
- Integridad de datos.

La prioridad es mantener una arquitectura:

```text
SEGURA
+
RÁPIDA
+
SIMPLE
+
ESCALABLE
```

---

# 2. Principio de seguridad

El cliente NO tendrá acceso directo para modificar pedidos.

Incorrecto:

```text
CLIENTE
  ↓
INSERT orders
```

Correcto:

```text
CLIENTE
  ↓
RPC segura
  ↓
Validaciones
  ↓
PostgreSQL
  ↓
ORDER
```

Lo mismo aplica para:

- Crear solicitudes.
- Consultar estado de pedidos.
- Solicitar cuenta.

---

# 3. Arquitectura de acceso

```text
                  SUPABASE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
    ANON           AUTH         SERVICE
       │             │             │
       ▼             ▼             ▼
   CLIENTE       STAFF       OPERACIONES
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                PostgreSQL
                     │
                     ▼
                    RLS
```

---

# 4. Extensiones

```sql
create extension if not exists pgcrypto;
```

---

# 5. ENUMS

## Estado restaurante

```sql
create type public.restaurant_status as enum (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED'
);
```

## Roles

```sql
create type public.member_role as enum (
  'OWNER',
  'ADMIN',
  'WAITER',
  'KITCHEN'
);
```

## Estado usuario

```sql
create type public.member_status as enum (
  'ACTIVE',
  'INACTIVE'
);
```

## Estado mesa

```sql
create type public.table_status as enum (
  'AVAILABLE',
  'OCCUPIED',
  'ATTENTION',
  'BILL_REQUESTED',
  'INACTIVE'
);
```

## Estado de sesión de mesa

```sql
create type public.table_session_status as enum (
  'ACTIVE',
  'CLOSED',
  'EXPIRED'
);
```

## Estado pedido

```sql
create type public.order_status as enum (
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED'
);
```

## Tipo de solicitud

```sql
create type public.waiter_call_type as enum (
  'WAITER',
  'BILL'
);
```

## Estado de solicitud

```sql
create type public.waiter_call_status as enum (
  'PENDING',
  'ACCEPTED',
  'ATTENDED',
  'REJECTED',
  'CANCELLED'
);
```

## Auditoría

```sql
create type public.audit_action as enum (
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'ACCEPT_ORDER',
  'REJECT_ORDER',
  'START_PREPARING',
  'MARK_ORDER_READY',
  'MARK_ORDER_DELIVERED',
  'CREATE_WAITER_CALL',
  'HANDLE_WAITER_CALL'
);
```

---

# 6. PROFILES

Relaciona el usuario de Supabase Auth con información propia.

```sql
create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  full_name text,

  avatar_url text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);
```

---

# 7. RESTAURANTS

```sql
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),

  name text not null,

  slug text not null unique,

  description text,

  logo_url text,

  cover_image_url text,

  phone text,

  address text,

  status public.restaurant_status not null
    default 'ACTIVE',

  timezone text not null
    default 'America/Guayaquil',

  opening_hours jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);
```

---

# 8. RESTAURANT MEMBERS

Relaciona usuarios con restaurantes.

```sql
create table public.restaurant_members (
  id uuid primary key default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  role public.member_role not null,

  status public.member_status not null
    default 'ACTIVE',

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  unique (restaurant_id, user_id)
);
```

---

# 9. TABLES

```sql
create table public.tables (
  id uuid primary key default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  number integer not null,

  name text,

  status public.table_status not null
    default 'AVAILABLE',

  qr_token uuid not null
    default gen_random_uuid()
    unique,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint tables_number_positive
    check (number > 0),

  unique (restaurant_id, number)
);
```

---

# 10. TABLE SESSIONS

Esta tabla resuelve el problema del cliente anónimo.

Cada vez que un cliente entra mediante QR podemos crear una sesión.

```sql
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  table_id uuid not null
    references public.tables(id)
    on delete cascade,

  session_token uuid not null
    default gen_random_uuid()
    unique,

  status public.table_session_status not null
    default 'ACTIVE',

  started_at timestamptz not null
    default now(),

  last_activity_at timestamptz not null
    default now(),

  closed_at timestamptz
);
```

La sesión permite:

```text
QR
 ↓
MESA
 ↓
SESIÓN
 ↓
PEDIDOS
```

---

# 11.1 Índices de sesiones

```sql
create index idx_table_sessions_table
  on public.table_sessions (table_id);

create index idx_table_sessions_restaurant
  on public.table_sessions (restaurant_id);

create index idx_table_sessions_token
  on public.table_sessions (session_token);

create index idx_table_sessions_status
  on public.table_sessions (status);
```

---

# 12. CATEGORIES

```sql
create table public.categories (
  id uuid primary key default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  name text not null,

  description text,

  position integer not null
    default 0,

  active boolean not null
    default true,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (restaurant_id, name)
);
```

---

# 13. PRODUCTS

```sql
create table public.products (
  id uuid primary key default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  category_id uuid
    references public.categories(id)
    on delete set null,

  name text not null,

  description text,

  price numeric(10,2) not null,

  image_url text,

  active boolean not null
    default true,

  available boolean not null
    default true,

  position integer not null
    default 0,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint products_price_non_negative
    check (price >= 0)
);
```

---

# 14. PRODUCT OPTIONS

Preparado para:

- Tamaños.
- Extras.
- Ingredientes.

```sql
create table public.product_options (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.products(id)
    on delete cascade,

  name text not null,

  type text not null,

  required boolean not null
    default false,

  position integer not null
    default 0,

  active boolean not null
    default true,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);
```

---

# 15. PRODUCT OPTION VALUES

```sql
create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),

  product_option_id uuid not null
    references public.product_options(id)
    on delete cascade,

  name text not null,

  price_modifier numeric(10,2) not null
    default 0,

  position integer not null
    default 0,

  active boolean not null
    default true,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);
```

---

# 16. ORDERS

Se incorpora la sesión del cliente.

```sql
create table public.orders (
  id uuid primary key
    default gen_random_uuid(),

  order_number bigint
    generated always as identity,

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete restrict,

  table_id uuid not null
    references public.tables(id)
    on delete restrict,

  table_session_id uuid
    references public.table_sessions(id)
    on delete set null,

  status public.order_status not null
    default 'PENDING',

  subtotal numeric(10,2) not null
    default 0,

  total numeric(10,2) not null
    default 0,

  notes text,

  accepted_by uuid
    references public.profiles(id)
    on delete set null,

  accepted_at timestamptz,

  preparing_at timestamptz,

  ready_at timestamptz,

  delivered_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint orders_subtotal_non_negative
    check (subtotal >= 0),

  constraint orders_total_non_negative
    check (total >= 0)
);
```

---

# 17. ORDER ITEMS

Mantiene snapshot histórico del producto.

```sql
create table public.order_items (
  id uuid primary key
    default gen_random_uuid(),

  order_id uuid not null
    references public.orders(id)
    on delete cascade,

  product_id uuid
    references public.products(id)
    on delete set null,

  product_name text not null,

  quantity integer not null,

  unit_price numeric(10,2) not null,

  subtotal numeric(10,2) not null,

  notes text,

  created_at timestamptz not null
    default now(),

  constraint order_items_quantity_positive
    check (quantity > 0),

  constraint order_items_unit_price_non_negative
    check (unit_price >= 0),

  constraint order_items_subtotal_non_negative
    check (subtotal >= 0)
);
```

---

# 18. ORDER ITEM OPTIONS

Guarda snapshot de las opciones elegidas.

```sql
create table public.order_item_options (
  id uuid primary key
    default gen_random_uuid(),

  order_item_id uuid not null
    references public.order_items(id)
    on delete cascade,

  option_name text not null,

  value_name text not null,

  price_modifier numeric(10,2) not null
    default 0,

  created_at timestamptz not null
    default now()
);
```

---

# 19. WAITER CALLS

```sql
create table public.waiter_calls (
  id uuid primary key
    default gen_random_uuid(),

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  table_id uuid not null
    references public.tables(id)
    on delete restrict,

  table_session_id uuid
    references public.table_sessions(id)
    on delete set null,

  type public.waiter_call_type not null,

  status public.waiter_call_status not null
    default 'PENDING',

  handled_by uuid
    references public.profiles(id)
    on delete set null,

  handled_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);
```

---

# 20. AUDIT LOGS

```sql
create table public.audit_logs (
  id uuid primary key
    default gen_random_uuid(),

  restaurant_id uuid
    references public.restaurants(id)
    on delete cascade,

  user_id uuid
    references public.profiles(id)
    on delete set null,

  action public.audit_action not null,

  entity_type text not null,

  entity_id uuid,

  metadata jsonb,

  created_at timestamptz not null
    default now()
);
```

---

# 21. ÍNDICES PRINCIPALES

## Restaurant members

```sql
create index idx_restaurant_members_restaurant
  on public.restaurant_members (restaurant_id);

create index idx_restaurant_members_user
  on public.restaurant_members (user_id);

create index idx_restaurant_members_role
  on public.restaurant_members (restaurant_id, role);
```

## Tables

```sql
create index idx_tables_restaurant
  on public.tables (restaurant_id);

create index idx_tables_restaurant_status
  on public.tables (restaurant_id, status);

create index idx_tables_qr_token
  on public.tables (qr_token);
```

## Categories

```sql
create index idx_categories_restaurant
  on public.categories (restaurant_id);

create index idx_categories_active_position
  on public.categories (
    restaurant_id,
    active,
    position
  );
```

## Products

```sql
create index idx_products_restaurant
  on public.products (restaurant_id);

create index idx_products_restaurant_category
  on public.products (
    restaurant_id,
    category_id
  );

create index idx_products_restaurant_available
  on public.products (
    restaurant_id,
    available
  );

create index idx_products_active_position
  on public.products (
    restaurant_id,
    active,
    position
  );
```

## Orders

```sql
create index idx_orders_restaurant
  on public.orders (restaurant_id);

create index idx_orders_restaurant_status
  on public.orders (
    restaurant_id,
    status
  );

create index idx_orders_restaurant_created
  on public.orders (
    restaurant_id,
    created_at desc
  );

create index idx_orders_table
  on public.orders (table_id);

create index idx_orders_session
  on public.orders (table_session_id);
```

## Order items

```sql
create index idx_order_items_order
  on public.order_items (order_id);

create index idx_order_items_product
  on public.order_items (product_id);
```

## Waiter calls

```sql
create index idx_waiter_calls_restaurant
  on public.waiter_calls (restaurant_id);

create index idx_waiter_calls_status
  on public.waiter_calls (
    restaurant_id,
    status
  );

create index idx_waiter_calls_table
  on public.waiter_calls (table_id);
```

---

# 22. UPDATED_AT

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

Triggers:

```sql
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
```

---

# 23. CREACIÓN AUTOMÁTICA DE PROFILE

```sql
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
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
```

---

# 24. RLS

Activar RLS:

```sql
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
```

---

# 25. Función — usuario pertenece al restaurante

```sql
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
```

---

# 26. Función — usuario tiene rol

```sql
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
```

---

# 27. PROFILE POLICIES

```sql
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);
```

---

# 28. RESTAURANT POLICIES

```sql
create policy restaurants_select_members
on public.restaurants
for select
to authenticated
using (
  public.user_belongs_to_restaurant(id)
);
```

Administración:

```sql
create policy restaurants_update_admin
on public.restaurants
for update
to authenticated
using (
  public.user_has_restaurant_role(id, 'OWNER')
  or
  public.user_has_restaurant_role(id, 'ADMIN')
)
with check (
  public.user_has_restaurant_role(id, 'OWNER')
  or
  public.user_has_restaurant_role(id, 'ADMIN')
);
```

---

# 29. RESTAURANT MEMBERS POLICIES

```sql
create policy restaurant_members_select
on public.restaurant_members
for select
to authenticated
using (
  public.user_belongs_to_restaurant(restaurant_id)
);
```

Crear:

```sql
create policy restaurant_members_insert_admin
on public.restaurant_members
for insert
to authenticated
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

Modificar:

```sql
create policy restaurant_members_update_admin
on public.restaurant_members
for update
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
)
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

---

# 30. TABLES POLICIES

```sql
create policy tables_select_members
on public.tables
for select
to authenticated
using (
  public.user_belongs_to_restaurant(restaurant_id)
);
```

Crear:

```sql
create policy tables_insert_admin
on public.tables
for insert
to authenticated
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

Modificar:

```sql
create policy tables_update_admin
on public.tables
for update
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
)
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

---

# 31. CATEGORIES POLICIES

```sql
create policy categories_select_members
on public.categories
for select
to authenticated
using (
  public.user_belongs_to_restaurant(restaurant_id)
);
```

Administradores:

```sql
create policy categories_insert_admin
on public.categories
for insert
to authenticated
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);

create policy categories_update_admin
on public.categories
for update
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
)
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);

create policy categories_delete_admin
on public.categories
for delete
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

---

# 32. PRODUCTS POLICIES

```sql
create policy products_select_members
on public.products
for select
to authenticated
using (
  public.user_belongs_to_restaurant(restaurant_id)
);
```

Administradores:

```sql
create policy products_insert_admin
on public.products
for insert
to authenticated
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);

create policy products_update_admin
on public.products
for update
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
)
with check (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);

create policy products_delete_admin
on public.products
for delete
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

---

# 33. PRODUCT OPTIONS POLICIES

Acceso mediante el restaurante propietario del producto.

```sql
create policy product_options_select_members
on public.product_options
for select
to authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_id
      and public.user_belongs_to_restaurant(
        p.restaurant_id
      )
  )
);
```

---

# 34. ORDERS — POLÍTICA IMPORTANTE

El cliente NO tendrá:

```sql
INSERT orders
```

directo.

Tampoco tendrá:

```sql
UPDATE orders
```

directo.

Las operaciones públicas se harán mediante funciones seguras.

El personal autenticado podrá consultar pedidos de su restaurante.

```sql
create policy orders_select_staff
on public.orders
for select
to authenticated
using (
  public.user_belongs_to_restaurant(restaurant_id)
);
```

No se permitirá una política general de `UPDATE`.

Las transiciones se realizarán mediante funciones de dominio.

---

# 35. ORDER ITEMS

El cliente no modificará directamente `order_items`.

El personal podrá consultarlos:

```sql
create policy order_items_select_staff
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.user_belongs_to_restaurant(
        o.restaurant_id
      )
  )
);
```

---

# 36. WAITER CALLS

El cliente no tendrá `INSERT` directo.

El personal podrá consultar:

```sql
create policy waiter_calls_select_staff
on public.waiter_calls
for select
to authenticated
using (
  public.user_belongs_to_restaurant(restaurant_id)
);
```

Las modificaciones se harán mediante funciones seguras.

---

# 37. AUDIT LOGS

```sql
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (
  public.user_has_restaurant_role(
    restaurant_id,
    'OWNER'
  )
  or
  public.user_has_restaurant_role(
    restaurant_id,
    'ADMIN'
  )
);
```

Los usuarios normales no podrán modificar auditorías.

---

# 38. RPC — RESOLVER QR

El cliente envía el token del QR.

La función valida:

- QR existente.
- Mesa activa.
- Restaurante activo.

Y crea una sesión.

Conceptualmente:

```text
QR TOKEN
   ↓
resolve_qr()
   ↓
Restaurant
Table
Session
```

Función:

```sql
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
```

Esta función será accesible para:

```text
anon
authenticated
```

pero no expondrá acceso directo a tablas administrativas.

---

# 39. RPC — CREAR PEDIDO

El cliente enviará:

```text
session_token
items
notes
```

Ejemplo conceptual:

```json
{
  "session_token": "UUID",
  "items": [
    {
      "product_id": "UUID",
      "quantity": 2,
      "notes": "Sin cebolla"
    }
  ],
  "notes": ""
}
```

La función debe:

1. Validar sesión.
2. Validar restaurante.
3. Validar mesa.
4. Validar productos.
5. Validar disponibilidad.
6. Obtener precios actuales.
7. Calcular subtotal.
8. Calcular total.
9. Crear pedido.
10. Crear items.
11. Crear snapshots históricos.

El cliente **nunca enviará el precio final como dato confiable**.

El servidor lo calculará.

---

# 40. RPC — VALIDAR Y CREAR PEDIDO

```sql
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

  -- Validamos todos los productos y calculamos
  -- el subtotal directamente desde la base.

  for v_item in
    select *
    from jsonb_array_elements(p_items)
  loop

    v_quantity :=
      (v_item ->> 'quantity')::integer;

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
      raise exception
        'Uno de los productos no está disponible';
    end if;

    v_item_subtotal :=
      v_product.price * v_quantity;

    v_subtotal :=
      v_subtotal + v_item_subtotal;

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

  -- Crear items con snapshot histórico.

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

    v_quantity :=
      (v_item ->> 'quantity')::integer;

    v_notes :=
      v_item ->> 'notes';

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
```

---

# 41. Seguridad de `create_customer_order`

La función:

```text
SECURITY DEFINER
```

permite ejecutar la operación con permisos controlados.

Sin embargo:

> Nunca deberá exponerse una función `SECURITY DEFINER` sin restringir su `search_path`, parámetros y lógica.

Por eso se utiliza:

```sql
set search_path = public
```

y la función valida explícitamente todos los datos.

---

# 42. RPC — CONSULTAR ESTADO DEL PEDIDO

El cliente necesita consultar su pedido sin estar autenticado.

No se debe abrir:

```text
SELECT * FROM orders
```

para `anon`.

En su lugar:

```text
session_token
+
order_id
        ↓
RPC
        ↓
validación
        ↓
estado
```

Conceptualmente:

```sql
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
```

---

# 43. RPC — LLAMAR MESERO

El cliente tampoco tendrá `INSERT` directo.

Utilizará:

```text
create_waiter_call()
```

La función deberá:

1. Validar sesión.
2. Validar mesa.
3. Validar restaurante.
4. Comprobar que no exista solicitud idéntica pendiente.
5. Crear solicitud.

---

# 44. RPC — SOLICITAR CUENTA

Se utilizará el mismo mecanismo.

```text
session_token
    ↓
request_bill()
    ↓
waiter_calls
```

No habrá acceso directo del navegador a:

```text
INSERT waiter_calls
```

---

# 45. TRANSICIONES SEGURAS DE PEDIDO

Las operaciones críticas serán funciones:

```text
accept_order()
reject_order()
start_order_preparing()
mark_order_ready()
mark_order_delivered()
```

No queremos:

```text
UPDATE orders SET status = ...
```

desde cualquier parte.

---

# 46. RPC — ACEPTAR PEDIDO

Reglas:

```text
Usuario autenticado
+
Rol WAITER / ADMIN / OWNER
+
Pedido PENDING
+
Mismo restaurante
```

Entonces:

```text
PENDING
   ↓
ACCEPTED
```

---

# 47. RPC — RECHAZAR PEDIDO

Reglas:

```text
Usuario autorizado
+
Pedido PENDING
```

Resultado:

```text
PENDING
   ↓
REJECTED
```

El motivo deberá quedar registrado.

Para ello podemos posteriormente agregar:

```text
rejection_reason
```

a `orders`.

---

# 48. RPC — PREPARAR

Solo cocina o personal autorizado.

```text
ACCEPTED
   ↓
PREPARING
```

---

# 49. RPC — MARCAR LISTO

Solo cocina o personal autorizado.

```text
PREPARING
   ↓
READY
```

---

# 50. RPC — ENTREGAR

Solo mesero o administración.

```text
READY
   ↓
DELIVERED
```

---

# 51. Regla de transición

Nunca se permitirá:

```text
PENDING → READY
PENDING → DELIVERED
REJECTED → PREPARING
DELIVERED → ACCEPTED
```

Las funciones deberán comprobar el estado actual.

---

# 52. Concurrencia

Caso:

```text
MESERO A → aceptar
MESERO B → aceptar
```

La operación deberá ser atómica.

Resultado:

```text
MESERO A → ✅
MESERO B → ❌ pedido ya procesado
```

La base de datos será la autoridad final.

---

# 53. Realtime

Se utilizará principalmente en:

```text
ORDERS
WAITER CALLS
```

Flujo:

```text
CLIENTE
 ↓
CREATE ORDER
 ↓
DATABASE
 ↓
REALTIME
 ↓
MESERO
```

Después:

```text
MESERO
 ↓
ACCEPT
 ↓
DATABASE
 ↓
REALTIME
 ↓
COCINA
```

Después:

```text
COCINA
 ↓
READY
 ↓
DATABASE
 ↓
REALTIME
 ↓
MESERO
```

---

# 54. Public Menu

La carta pública deberá ser de acceso rápido.

Para el cliente solo se expondrá:

```text
Restaurante
Categorías activas
Productos activos
Productos disponibles
```

No se expondrá:

- usuarios;
- pedidos de otros clientes;
- información administrativa;
- estadísticas;
- empleados.

---

# 55. Performance

La carta debe evitar consultas innecesarias.

Objetivo:

```text
QR
 ↓
Resolución de mesa
 ↓
Carta
```

No:

```text
QR
 ↓
10 consultas
 ↓
5 llamadas API
 ↓
javascript innecesario
 ↓
carta
```

---

# 56. Imágenes

Las fotos deberán almacenarse optimizadas.

El sistema podrá tener:

```text
imagen_original
imagen_optimizada
```

La carta pública utilizará la versión optimizada.

---

# 57. Carrito

El carrito permanecerá inicialmente en el navegador.

```text
PRODUCTOS
 ↓
CARRITO LOCAL
 ↓
CONFIRMAR
 ↓
RPC create_customer_order()
 ↓
ORDER
```

No necesitamos persistir carritos abandonados en PostgreSQL durante el MVP.

---

# 58. Seguridad multi-tenant

Todas las entidades importantes incluyen:

```text
restaurant_id
```

Esto permite aplicar:

```text
Usuario
 ↓
restaurant_members
 ↓
restaurant_id
 ↓
RLS
```

---

# 59. Histórico

Los pedidos conservan:

```text
product_name
unit_price
subtotal
```

Por lo tanto:

```text
Producto actual ≠ Pedido histórico
```

El histórico permanece intacto.

---

# 60. Auditoría

Las operaciones importantes deberán registrar:

```text
usuario
acción
entidad
id
fecha
metadata
```

Ejemplo:

```text
Juan Pérez
ACCEPT_ORDER
ORDER
#128
01/09/2026
```

---

# 61. Flujo seguro completo

```text
                 CLIENTE
                    │
                    ▼
                    QR
                    │
                    ▼
            resolve_table_qr()
                    │
                    ▼
               SESSION
                    │
                    ▼
                 CARTA
                    │
                    ▼
                CARRITO
                    │
                    ▼
        create_customer_order()
                    │
                    ▼
               PENDING
                    │
                    ▼
                 MESERO
              ┌─────┴─────┐
              ▼           ▼
           ACCEPT       REJECT
              │
              ▼
           KITCHEN
              │
              ▼
         PREPARING
              │
              ▼
            READY
              │
              ▼
           MESERO
              │
              ▼
          DELIVERED
```

---

# 62. Arquitectura final de seguridad

```text
                 CLIENTE ANÓNIMO
                        │
                        ▼
                      QR
                        │
                        ▼
                     RPC
                        │
                        ▼
                 VALIDACIONES
                        │
                        ▼
                   DATABASE
                        │
                        ▼
                      RLS
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
          MESERO                COCINA
        AUTENTICADO            AUTENTICADO
             │                     │
             ▼                     ▼
        TRANSICIONES          PREPARACIÓN
             │                     │
             └──────────┬──────────┘
                        ▼
                    RESTAURANTE
```

---

# 63. Decisiones oficiales de Database V2

```text
✅ PostgreSQL
✅ Supabase
✅ UUID
✅ Multi-tenant
✅ RLS
✅ Supabase Auth
✅ Cliente anónimo
✅ Sesión de mesa
✅ QR token
✅ RPC para operaciones públicas
✅ RPC para transiciones críticas
✅ Server-side validation
✅ Snapshot de productos
✅ Histórico de precios
✅ Auditoría
✅ Índices
✅ Constraints
✅ Realtime
✅ Carrito local
✅ Mobile First
✅ Performance First
```

---

# 64. Qué queda fuera de esta versión

Todavía no implementaremos:

```text
❌ Pagos
❌ Facturación
❌ POS
❌ Inventario
❌ Reservaciones
❌ Fidelización
❌ Delivery
❌ Programa de puntos
❌ App móvil nativa
❌ Microservicios
❌ Redis obligatorio
```

---

# 65. Próximo paso

Con el diseño de base de datos V2 cerrado, debemos crear:

# DATABASE DESIGN V3 — FUNCIONES SQL COMPLETAS

Ahí terminaremos específicamente:

```text
resolve_table_qr()
create_customer_order()
get_customer_order()
create_waiter_call()
request_bill()

accept_order()
reject_order()
start_order_preparing()
mark_order_ready()
mark_order_delivered()

handle_waiter_call()
```

Además:

```text
RLS DEFINITIVO
+
GRANTS
+
REVOKE
+
MIGRATIONS
+
TEST DATA
+
SEED
```

Después podremos pasar a:

```text
DATABASE V3
      ↓
DESIGN SYSTEM
      ↓
NEXT.JS SETUP
      ↓
SUPABASE SETUP
      ↓
AUTH
      ↓
PRIMER MÓDULO
```

---

# 66. Criterio de aceptación

La base de datos no estará considerada lista hasta que pueda garantizar:

```text
CLIENTE
   ↓
QR
   ↓
SESIÓN
   ↓
PEDIDO
   ↓
MESERO
   ↓
COCINA
   ↓
LISTO
   ↓
MESERO
   ↓
ENTREGADO
```

sin:

```text
❌ acceso entre restaurantes
❌ manipulación de precios
❌ pedidos duplicados
❌ modificaciones arbitrarias de estados
❌ acceso anónimo a pedidos ajenos
❌ cocina aceptando/rechazando pedidos
```

El criterio principal será:

> **El cliente debe tener una experiencia rápida y sencilla, mientras que toda operación crítica queda protegida por PostgreSQL, RLS y funciones de dominio.**