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
      true
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop policy if exists "session_broadcast_readable_by_holder" on realtime.messages;

create policy "session_broadcast_readable_by_holder"
on realtime.messages
for select
to anon, authenticated
using (topic ~ '^session:[0-9a-f]{64}$');
