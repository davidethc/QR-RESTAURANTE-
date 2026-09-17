
-- Limpiar todo lo anterior para aplicar V2

-- Triggers
DROP TRIGGER IF EXISTS set_updated_at_orders ON public.orders;
DROP TRIGGER IF EXISTS set_updated_at_products ON public.products;
DROP TRIGGER IF EXISTS set_updated_at_categories ON public.categories;
DROP TRIGGER IF EXISTS set_updated_at_tables ON public.tables;
DROP TRIGGER IF EXISTS set_updated_at_restaurant_members ON public.restaurant_members;
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
DROP TRIGGER IF EXISTS set_updated_at_restaurants ON public.restaurants;

-- Functions
DROP FUNCTION IF EXISTS public.get_user_restaurant_id();

-- Tablas (orden inverso por dependencias)
DROP TABLE IF EXISTS public.waiter_calls CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.tables CASCADE;
DROP TABLE IF EXISTS public.restaurant_members CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.restaurants CASCADE;

-- Enums
DROP TYPE IF EXISTS public.call_status CASCADE;
DROP TYPE IF EXISTS public.call_type CASCADE;
DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.table_status CASCADE;
DROP TYPE IF EXISTS public.member_status CASCADE;
DROP TYPE IF EXISTS public.member_role CASCADE;
DROP TYPE IF EXISTS public.restaurant_status CASCADE;
