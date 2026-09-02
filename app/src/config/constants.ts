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
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type CallType = (typeof CALL_TYPE)[keyof typeof CALL_TYPE];
export type CallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];
export type TableStatus = (typeof TABLE_STATUS)[keyof typeof TABLE_STATUS];
export type TableSessionStatus = (typeof TABLE_SESSION_STATUS)[keyof typeof TABLE_SESSION_STATUS];
export type RestaurantStatus = (typeof RESTAURANT_STATUS)[keyof typeof RESTAURANT_STATUS];
export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
