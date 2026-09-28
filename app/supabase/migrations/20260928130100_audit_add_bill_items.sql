-- ---------------------------------------------------------------------------
-- Caja · agregar producto durante el cobro (2/3).
--
-- Va sola: un valor nuevo de enum no puede usarse en la misma transacción en
-- la que se agrega. La RPC que lo usa llega en 20260928130200.
-- ---------------------------------------------------------------------------

alter type public.audit_action add value if not exists 'ADD_BILL_ITEMS';
