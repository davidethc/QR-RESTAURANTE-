
-- Extensión para auto-actualizar updated_at
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- === ENUMS ===

CREATE TYPE public.restaurant_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.member_role AS ENUM ('OWNER', 'ADMIN', 'WAITER', 'KITCHEN');
CREATE TYPE public.member_status AS ENUM ('active', 'inactive');
CREATE TYPE public.table_status AS ENUM ('available', 'occupied', 'maintenance');
CREATE TYPE public.order_status AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'REJECTED', 'CANCELLED');
CREATE TYPE public.call_type AS ENUM ('WAITER', 'BILL');
CREATE TYPE public.call_status AS ENUM ('PENDING', 'ACCEPTED', 'ATTENDED', 'REJECTED');
