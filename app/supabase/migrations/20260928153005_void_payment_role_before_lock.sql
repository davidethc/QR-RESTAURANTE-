-- ---------------------------------------------------------------------------
-- Dinero (1/3) · void_payment: rol antes del candado y caja nula no pasa.
--
--   1. El chequeo OWNER/ADMIN va ANTES de lock_bill. Antes, cualquier
--      usuario autenticado podía tomar el candado de la mesa y la cuenta
--      (y hacer esperar a un cobro real) aunque después fallara el rol.
--   2. "v_cash_status <> 'OPEN'" con un cash_session_id nulo daba NULL y se
--      saltaba la validación. Ahora es "is distinct from 'OPEN'".
--
-- Resto del cuerpo idéntico a la versión vigente en producción.
-- ---------------------------------------------------------------------------

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill_id       uuid;
  v_restaurant_id uuid;
  v_bill          public.bills%rowtype;
  v_payment       public.payments%rowtype;
  v_cash_status   public.cash_session_status;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select bill_id, restaurant_id
  into v_bill_id, v_restaurant_id
  from public.payments
  where id = p_payment_id;

  if v_bill_id is null then
    raise exception 'Pago no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador anulan pagos';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe el motivo de la anulación (mínimo 3 caracteres)';
  end if;

  v_bill := public.lock_bill(v_bill_id);

  select * into v_payment from public.payments where id = p_payment_id for update;

  if v_payment.status <> 'COMPLETED' then
    raise exception 'El pago ya está anulado';
  end if;

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La cuenta ya está cerrada: registra la devolución como salida de caja';
  end if;

  select status into v_cash_status
  from public.cash_sessions
  where id = v_payment.cash_session_id
  for share;

  if v_cash_status is distinct from 'OPEN' then
    raise exception 'La caja de este pago ya se cerró: registra la devolución como salida de caja';
  end if;

  update public.payments
  set status = 'VOIDED',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = btrim(p_reason)
  where id = p_payment_id;

  perform public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'VOID_PAYMENT', 'PAYMENT', p_payment_id,
    jsonb_build_object(
      'bill_id', v_bill.id, 'method', v_payment.method, 'amount', v_payment.amount,
      'tip_amount', v_payment.tip_amount, 'reason', btrim(p_reason)
    )
  );

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated, service_role;
