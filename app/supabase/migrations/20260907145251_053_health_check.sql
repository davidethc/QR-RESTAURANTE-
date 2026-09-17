-- Latido para que Supabase no pause el proyecto.
--
-- Los proyectos del plan gratuito se pausan tras 7 días de poca
-- actividad de base de datos, y la documentación dice que bastan "unas
-- pocas peticiones de usuario a la base cada día". La clave está en
-- "de usuario": un pg_cron dentro de la propia base no cuenta, y un
-- ping a la carta tampoco, porque esa consulta está cacheada 5 minutos
-- en la app y nunca llega a Postgres.
--
-- Esta función es la consulta real más barata posible: devuelve la
-- hora del servidor y nada más. No lee ninguna tabla, no expone ni un
-- dato del negocio, y sirve además para comprobar de un vistazo que la
-- base responde.
--
-- SECURITY INVOKER a propósito: no necesita permisos elevados, así que
-- no se le dan.
create or replace function public.health_check()
returns timestamptz
language sql
security invoker
set search_path = public, pg_temp
as $$
  select now();
$$;

comment on function public.health_check() is
  'Latido para monitoreo externo. Devuelve la hora del servidor; no lee ninguna tabla.';

-- Quien la llama es el monitor, que no está autenticado.
revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
