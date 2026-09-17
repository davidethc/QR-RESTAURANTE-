
-- El estado de la mesa se deduce solo de lo que está pasando en ella.
-- Nadie tiene que actualizarlo a mano: menos errores y menos código en el front.
-- Prioridad: cuenta pedida > atención pedida > pedidos activos > libre.
-- INACTIVE nunca se toca: la desactiva el admin a propósito.

create or replace function public.refresh_table_status(
  p_table_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.table_status;
  v_new public.table_status;
begin
  select status into v_current
  from public.tables
  where id = p_table_id;

  if not found or v_current = 'INACTIVE' then
    return;
  end if;

  if exists (
    select 1 from public.waiter_calls
    where table_id = p_table_id
      and type = 'BILL'
      and status in ('PENDING', 'ACCEPTED')
  ) then
    v_new := 'BILL_REQUESTED';

  elsif exists (
    select 1 from public.waiter_calls
    where table_id = p_table_id
      and type = 'WAITER'
      and status in ('PENDING', 'ACCEPTED')
  ) then
    v_new := 'ATTENTION';

  elsif exists (
    select 1 from public.orders
    where table_id = p_table_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    v_new := 'OCCUPIED';

  else
    v_new := 'AVAILABLE';
  end if;

  if v_new is distinct from v_current then
    update public.tables
    set status = v_new
    where id = p_table_id;
  end if;
end;
$$;

revoke execute on function public.refresh_table_status(uuid) from public, anon, authenticated;


create or replace function public.trg_refresh_table_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_table_status(
    coalesce(new.table_id, old.table_id)
  );
  return null;
end;
$$;

create trigger orders_refresh_table_status
after insert or update of status or delete on public.orders
for each row execute function public.trg_refresh_table_status();

create trigger waiter_calls_refresh_table_status
after insert or update of status or delete on public.waiter_calls
for each row execute function public.trg_refresh_table_status();
