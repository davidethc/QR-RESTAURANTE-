export const ORDER_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PREPARING",
  READY: "READY",
  DELIVERED: "DELIVERED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export const CALL_TYPE = {
  WAITER: "WAITER",
  BILL: "BILL",
} as const;

export const CALL_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  ATTENDED: "ATTENDED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export const TABLE_STATUS = {
  AVAILABLE: "AVAILABLE",
  OCCUPIED: "OCCUPIED",
  ATTENTION: "ATTENTION",
  BILL_REQUESTED: "BILL_REQUESTED",
  INACTIVE: "INACTIVE",
} as const;

export const TABLE_SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED",
} as const;

/** Mesa real o el "Mostrador" oculto de las ventas para llevar (C1). */
export const TABLE_KIND = {
  TABLE: "TABLE",
  COUNTER: "COUNTER",
} as const;

export const RESTAURANT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export const MEMBER_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export const USER_ROLE = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  WAITER: "WAITER",
  KITCHEN: "KITCHEN",
} as const;

export const AUDIT_ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  ACCEPT_ORDER: "ACCEPT_ORDER",
  REJECT_ORDER: "REJECT_ORDER",
  START_PREPARING: "START_PREPARING",
  MARK_ORDER_READY: "MARK_ORDER_READY",
  MARK_ORDER_DELIVERED: "MARK_ORDER_DELIVERED",
  CREATE_WAITER_CALL: "CREATE_WAITER_CALL",
  HANDLE_WAITER_CALL: "HANDLE_WAITER_CALL",
  OPEN_BILL: "OPEN_BILL",
  APPLY_DISCOUNT: "APPLY_DISCOUNT",
  REMOVE_DISCOUNT: "REMOVE_DISCOUNT",
  SET_BILL_SPLIT: "SET_BILL_SPLIT",
  RECORD_PAYMENT: "RECORD_PAYMENT",
  ADD_BILL_ITEMS: "ADD_BILL_ITEMS",
  VOID_PAYMENT: "VOID_PAYMENT",
  CLOSE_BILL: "CLOSE_BILL",
  VOID_BILL: "VOID_BILL",
  FORCE_CLOSE_SESSION: "FORCE_CLOSE_SESSION",
  OPEN_CASH_SESSION: "OPEN_CASH_SESSION",
  CLOSE_CASH_SESSION: "CLOSE_CASH_SESSION",
  CASH_MOVEMENT: "CASH_MOVEMENT",
} as const;

export const PAYMENT_METHOD = {
  CASH: "CASH",
  CARD: "CARD",
  TRANSFER: "TRANSFER",
  OTHER: "OTHER",
} as const;

export const PAYMENT_STATUS = {
  COMPLETED: "COMPLETED",
  VOIDED: "VOIDED",
} as const;

export const BILL_STATUS = {
  OPEN: "OPEN",
  PAID: "PAID",
  CLOSED: "CLOSED",
  VOID: "VOID",
} as const;

export const CASH_SESSION_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

export const DISCOUNT_KIND = {
  PERCENT: "PERCENT",
  FIXED: "FIXED",
} as const;

export const SPLIT_MODE = {
  NONE: "NONE",
  EQUAL: "EQUAL",
  ITEMS: "ITEMS",
} as const;

export const CASH_MOVEMENT_TYPE = {
  IN: "IN",
  OUT: "OUT",
} as const;

export const CASH_MOVEMENT_REASON = {
  FLOAT_TOPUP: "FLOAT_TOPUP",
  TIPS_PAYOUT: "TIPS_PAYOUT",
  SUPPLIER_PAYMENT: "SUPPLIER_PAYMENT",
  EXPENSE: "EXPENSE",
  REFUND: "REFUND",
  WITHDRAWAL: "WITHDRAWAL",
  OTHER: "OTHER",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type CallType = (typeof CALL_TYPE)[keyof typeof CALL_TYPE];
export type CallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];
export type TableStatus = (typeof TABLE_STATUS)[keyof typeof TABLE_STATUS];
export type TableSessionStatus = (typeof TABLE_SESSION_STATUS)[keyof typeof TABLE_SESSION_STATUS];
export type TableKind = (typeof TABLE_KIND)[keyof typeof TABLE_KIND];
export type RestaurantStatus = (typeof RESTAURANT_STATUS)[keyof typeof RESTAURANT_STATUS];
export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];
export type CashSessionStatus = (typeof CASH_SESSION_STATUS)[keyof typeof CASH_SESSION_STATUS];
export type DiscountKind = (typeof DISCOUNT_KIND)[keyof typeof DISCOUNT_KIND];
export type SplitMode = (typeof SPLIT_MODE)[keyof typeof SPLIT_MODE];
export type CashMovementType = (typeof CASH_MOVEMENT_TYPE)[keyof typeof CASH_MOVEMENT_TYPE];
export type CashMovementReason = (typeof CASH_MOVEMENT_REASON)[keyof typeof CASH_MOVEMENT_REASON];
