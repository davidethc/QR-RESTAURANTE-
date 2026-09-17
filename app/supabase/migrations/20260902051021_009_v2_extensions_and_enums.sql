
-- V2: Extensiones
create extension if not exists pgcrypto;

-- V2: Enums
create type public.restaurant_status as enum (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED'
);

create type public.member_role as enum (
  'OWNER',
  'ADMIN',
  'WAITER',
  'KITCHEN'
);

create type public.member_status as enum (
  'ACTIVE',
  'INACTIVE'
);

create type public.table_status as enum (
  'AVAILABLE',
  'OCCUPIED',
  'ATTENTION',
  'BILL_REQUESTED',
  'INACTIVE'
);

create type public.table_session_status as enum (
  'ACTIVE',
  'CLOSED',
  'EXPIRED'
);

create type public.order_status as enum (
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED'
);

create type public.waiter_call_type as enum (
  'WAITER',
  'BILL'
);

create type public.waiter_call_status as enum (
  'PENDING',
  'ACCEPTED',
  'ATTENDED',
  'REJECTED',
  'CANCELLED'
);

create type public.audit_action as enum (
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'ACCEPT_ORDER',
  'REJECT_ORDER',
  'START_PREPARING',
  'MARK_ORDER_READY',
  'MARK_ORDER_DELIVERED',
  'CREATE_WAITER_CALL',
  'HANDLE_WAITER_CALL'
);
