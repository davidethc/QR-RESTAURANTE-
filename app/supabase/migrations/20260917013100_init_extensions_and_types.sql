-- Enable pgcrypto for UUID generation
create extension if not exists pgcrypto;

-- Restaurant status
create type public.restaurant_status as enum (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED'
);

-- Member roles
create type public.member_role as enum (
  'OWNER',
  'ADMIN',
  'WAITER',
  'KITCHEN'
);

-- Member status
create type public.member_status as enum (
  'ACTIVE',
  'INACTIVE'
);

-- Table status
create type public.table_status as enum (
  'AVAILABLE',
  'OCCUPIED',
  'ATTENTION',
  'BILL_REQUESTED',
  'INACTIVE'
);

-- Table session status
create type public.table_session_status as enum (
  'ACTIVE',
  'CLOSED',
  'EXPIRED'
);

-- Order status
create type public.order_status as enum (
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED'
);

-- Waiter call type
create type public.waiter_call_type as enum (
  'WAITER',
  'BILL'
);

-- Waiter call status
create type public.waiter_call_status as enum (
  'PENDING',
  'ACCEPTED',
  'ATTENDED',
  'REJECTED',
  'CANCELLED'
);

-- Audit action
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
