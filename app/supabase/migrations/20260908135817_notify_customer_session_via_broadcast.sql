create or replace function public.notify_table_session_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token uuid;
begin
  if new.table_session_id is null then
    return new;
  end if;

  select session_token into v_token
    from public.table_sessions
   where id = new.table_session_id;

  if v_token is null then
    return new;
  end if;

  begin
    perform realtime.send(
      '{}'::jsonb,
      'session_changed',
      'session:' || encode(digest(v_token::text, 'sha256'), 'hex'),
      false
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

revoke all on function public.notify_table_session_change() from public, anon, authenticated;

drop trigger if exists orders_notify_session on public.orders;
create trigger orders_notify_session
  after insert or update of status on public.orders
  for each row execute function public.notify_table_session_change();

drop trigger if exists waiter_calls_notify_session on public.waiter_calls;
create trigger waiter_calls_notify_session
  after insert or update of status on public.waiter_calls
  for each row execute function public.notify_table_session_change();
