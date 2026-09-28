-- ---------------------------------------------------------------------------
-- Dinero · void_bill: el rol OWNER/ADMIN se valida ANTES de lock_bill.
--
-- Igual que void_payment (20260928151200): antes cualquier usuario
-- autenticado tomaba el candado de la mesa y la cuenta (y hacía esperar a un
-- cobro real) aunque después fallara el chequeo de rol.
--
-- Resto del cuerpo idéntico a la versión vigente en producción.
-- ---------------------------------------------------------------------------

create or replace function public.void_bill(p_bill_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_bill public.bills%rowtype;
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
    raise exception 'Solo el dueño o un administrador anulan cuentas';
  end if;

  v_bill := public.lock_bill(p_bill_id);

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La cuenta ya está cerrada o anulada';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe el motivo de la anulación (mínimo 3 caracteres)';
  end if;

  if exists (
    select 1 from public.payments
    where bill_id = v_bill.id and status = 'COMPLETED'
  ) then
    raise exception 'La cuenta tiene pagos: anúlalos primero';
  end if;

  -- balance/total no cambian; VOID no exige saldo 0 (bills_settled_check).
  update public.bills
  set status = 'VOID',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = btrim(p_reason)
  where id = v_bill.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'VOID_BILL', 'BILL', v_bill.id,
    jsonb_build_object('bill_number', v_bill.bill_number, 'total', v_bill.total, 'reason', btrim(p_reason))
  );

  perform public.refresh_table_status(v_bill.table_id);

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.void_bill(uuid, text) from public, anon;
grant execute on function public.void_bill(uuid, text) to authenticated, service_role;
