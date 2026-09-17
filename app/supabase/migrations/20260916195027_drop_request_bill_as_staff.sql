-- "Pedir la cuenta" pasa a ser exclusivo del cliente desde su teléfono
-- (create_waiter_call / callWaiter, tipo BILL). El mesero ya no tiene
-- ninguna vía, ni de UI ni de RPC, para marcar que una mesa pidió la
-- cuenta en su nombre.
drop function if exists public.request_bill_as_staff(uuid);
