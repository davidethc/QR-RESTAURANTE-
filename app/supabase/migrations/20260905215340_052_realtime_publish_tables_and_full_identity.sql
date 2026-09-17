-- Publica `tables` para que liberar una mesa avise a las demás tablets.
--
-- Hasta ahora la publicación solo tenía `orders` y `waiter_calls`. Los
-- cambios de estado de una mesa llegaban de rebote, porque el trigger
-- que los produce se dispara junto a una escritura en una de esas dos
-- tablas. La excepción es `close_table_session`: escribe en
-- `table_sessions` y llama al trigger directamente, sin tocar ninguna
-- tabla publicada. Resultado: el mesero A libera la mesa 3 y las
-- tablets de B y C la siguen viendo ocupada indefinidamente.
alter publication supabase_realtime add table public.tables;

-- REPLICA IDENTITY FULL en las tres tablas publicadas.
--
-- Con la identidad por defecto, un evento DELETE viaja solo con la
-- clave primaria. El cliente filtra el canal por `restaurant_id=eq.X`,
-- y como ese campo no viene en el payload, el evento se descarta en
-- silencio. Hoy nadie borra pedidos —se usan CANCELLED y REJECTED— así
-- que es un riesgo latente, no un fallo activo: pero cualquier limpieza
-- futura pasaría desapercibida en la pantalla del mesero.
alter table public.tables       replica identity full;
alter table public.orders       replica identity full;
alter table public.waiter_calls replica identity full;

-- La RLS de Realtime se evalúa una vez por evento y por suscriptor, y
-- pasa por user_belongs_to_restaurant(). Este índice cubre justo esa
-- consulta.
create index if not exists idx_rm_user_rest_active
  on public.restaurant_members (user_id, restaurant_id)
  where status = 'ACTIVE';
