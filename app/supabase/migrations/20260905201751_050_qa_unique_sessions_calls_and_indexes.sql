-- QA: carreras de escritura e índices que faltaban.
--
-- 1. Una sola sesión ACTIVE por mesa, garantizada por la base.
--    resolve_table_qr hacía select-then-insert sin bloqueo: dos clientes
--    escaneando el mismo QR a la vez (una pareja sentándose, el caso
--    normal) creaban dos sesiones. Con dos sesiones, el pedido de uno no
--    aparece en el tracker del otro y el total de la mesa se parte en
--    dos. El código ya intenta reutilizar la sesión; esto lo vuelve
--    imposible de romper, venga de donde venga la escritura.
create unique index if not exists uq_table_sessions_one_active
  on table_sessions (table_id)
  where status = 'ACTIVE';

-- 2. Una sola solicitud PENDING por mesa y tipo. create_waiter_call ya
--    comprueba antes de insertar, pero dos toques rápidos de "Llamar
--    mesero" pasan los dos por la comprobación antes de que ninguno
--    haya insertado.
create unique index if not exists uq_waiter_calls_one_pending
  on waiter_calls (table_id, type)
  where status = 'PENDING';

-- 3. audit_logs se lee filtrando por restaurant_id (lo exige su propia
--    política RLS) y no tenía índice: recorrido secuencial completo, y
--    es la tabla que más crece de todo el sistema.
create index if not exists idx_audit_logs_restaurant_created
  on audit_logs (restaurant_id, created_at desc);

create index if not exists idx_waiter_calls_session
  on waiter_calls (table_session_id);

-- 4. Las políticas de profiles evaluaban auth.uid() una vez por fila.
--    Envolverlo en un subselect lo convierte en un solo cálculo.
alter policy profiles_select_own on profiles
  using (id = (select auth.uid()));
alter policy profiles_update_own on profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
