
-- Función de trigger: la ejecuta Postgres, nunca un usuario vía API.
revoke execute on function public.trg_refresh_table_status() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
