create or replace function public.get_session_calls(p_session_token uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_session public.table_sessions%rowtype;
  v_result jsonb;
begin
  select * into v_session
  from public.table_sessions
  where session_token = p_session_token;

  if not found then
    raise exception 'Sesión de mesa inválida';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',         c.id,
        'type',       c.type,
        'status',     c.status,
        'created_at', c.created_at
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.waiter_calls c
  where c.table_session_id = v_session.id;

  return v_result;
end;
$function$;
