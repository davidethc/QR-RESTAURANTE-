-- ---------------------------------------------------------------------------
-- Módulo 1 · M4 · Valores de auditoría del cobro y la caja.
--
-- Va sola: un valor nuevo de enum no puede usarse en la misma transacción
-- en la que se agrega. Las RPCs que los usan llegan en M9 y M10.
-- ---------------------------------------------------------------------------

alter type public.audit_action add value if not exists 'OPEN_BILL';
alter type public.audit_action add value if not exists 'APPLY_DISCOUNT';
alter type public.audit_action add value if not exists 'REMOVE_DISCOUNT';
alter type public.audit_action add value if not exists 'SET_BILL_SPLIT';
alter type public.audit_action add value if not exists 'RECORD_PAYMENT';
alter type public.audit_action add value if not exists 'VOID_PAYMENT';
alter type public.audit_action add value if not exists 'CLOSE_BILL';
alter type public.audit_action add value if not exists 'VOID_BILL';
alter type public.audit_action add value if not exists 'FORCE_CLOSE_SESSION';
alter type public.audit_action add value if not exists 'OPEN_CASH_SESSION';
alter type public.audit_action add value if not exists 'CLOSE_CASH_SESSION';
alter type public.audit_action add value if not exists 'CASH_MOVEMENT';
