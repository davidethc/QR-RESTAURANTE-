-- ---------------------------------------------------------------------------
-- Dinero (2/3) · set_bill_split: solo OWNER/ADMIN (el mesero ya no cobra).
--
-- El rol se valida antes de lock_bill, igual que en void_payment.
-- Resto del cuerpo idéntico a la versión vigente en producción.
-- ---------------------------------------------------------------------------

create or replace function public.set_bill_split(
  p_bill_id uuid,
  p_mode public.bill_split_mode,
  p_parts integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_bill  public.bills%rowtype;
  v_parts integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;
  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para cobrar';
  end if;

  v_bill := public.lock_bill(p_bill_id);

  if v_bill.status <> 'OPEN' then
    raise exception 'Solo se puede dividir una cuenta abierta';
  end if;

  if p_mode is null then
    raise exception 'Modo de división inválido';
  end if;

  if p_mode = 'EQUAL' then
    v_parts := coalesce(p_parts, 0);
    if v_parts < 2 or v_parts > 50 then
      raise exception 'Las partes iguales van de 2 a 50';
    end if;
  else
    v_parts := 1;
  end if;

  update public.bills
  set split_mode = p_mode,
      split_parts = v_parts
  where id = v_bill.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'SET_BILL_SPLIT', 'BILL', v_bill.id,
    jsonb_build_object('mode', p_mode, 'parts', v_parts)
  );

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.set_bill_split(uuid, public.bill_split_mode, integer) from public, anon;
grant execute on function public.set_bill_split(uuid, public.bill_split_mode, integer) to authenticated, service_role;
