-- El proyecto tiene default privileges que otorgan EXECUTE a anon y
-- authenticated sobre toda función nueva del schema public. Un
-- "revoke ... from public" NO se los quita, porque su grant es directo.
--
-- find_or_create_active_table_session es el caso grave: no valida nada por
-- dentro (confía en que solo la llamen funciones SECURITY DEFINER ya
-- autorizadas) y devuelve la fila completa de table_sessions, incluido el
-- session_token. Expuesta a anon, cualquiera con un table_id podría obtener
-- el token de esa mesa y con él leer o crear pedidos ajenos. Se revoca a
-- ambos roles: dentro de una función SECURITY DEFINER el current_user es el
-- owner (postgres), así que create_staff_order la sigue pudiendo llamar.
revoke execute on function public.find_or_create_active_table_session(uuid, uuid) from anon, authenticated;

-- Las tres de staff sí validan auth.uid() y rol por dentro, pero no tienen
-- por qué estar publicadas al rol anónimo: defensa en profundidad.
revoke execute on function public.create_staff_order(uuid, jsonb, text) from anon;
revoke execute on function public.request_bill_as_staff(uuid) from anon;
revoke execute on function public.get_top_products(uuid, integer) from anon;
