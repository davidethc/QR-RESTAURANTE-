-- ---------------------------------------------------------------------------
-- Caja · agregar producto durante el cobro (2/3).
--
-- ADD_BILL_ITEMS: acción de auditoría para add_items_to_bill (ver
-- 20260928130200_add_items_to_bill_rpc.sql). Un valor nuevo de enum debe
-- quedar confirmado en su propia migración/transacción antes de poder
-- usarse en el cuerpo de otra función: por eso va separado del archivo
-- de la RPC, aunque los dos se apliquen seguidos.
-- ---------------------------------------------------------------------------

alter type public.audit_action add value if not exists 'ADD_BILL_ITEMS';
