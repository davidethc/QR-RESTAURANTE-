import type {
  BillStatus,
  CashMovementReason,
  CashMovementType,
  CashSessionStatus,
  DiscountKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SplitMode,
  TableKind,
  TableSessionStatus,
} from "@/config/constants";

/**
 * Formas JSON que devuelven las RPCs de cobro y caja (migraciones M8–M12).
 * Postgres serializa numeric como number en jsonb. Mantener en sincronía con
 * bill_json(), get_cash_session_summary() y get_session_bill().
 */

export type BillItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
};

export type BillOrder = {
  id: string;
  order_number: number;
  status: OrderStatus;
  total: number;
  created_at: string;
  billable: boolean;
  items: BillItem[];
};

export type BillDiscount = {
  id: string;
  order_item_id: string | null;
  kind: DiscountKind;
  value: number;
  amount: number;
  reason: string;
  applied_by: string | null;
  applied_at: string;
};

export type BillPayment = {
  id: string;
  method: PaymentMethod;
  amount: number;
  tip_amount: number;
  tendered_amount: number | null;
  change_amount: number | null;
  reference: string | null;
  card_type: string | null;
  status: PaymentStatus;
  received_by: string | null;
  received_at: string;
  voided_at: string | null;
  void_reason: string | null;
  cash_session_id: string;
};

export type Bill = {
  id: string;
  bill_number: number;
  restaurant_id: string;
  table_id: string;
  table_number: number;
  table_name: string | null;
  /** Venta de mostrador (C3): "COUNTER", con su "#N" y nombre opcional. */
  table_kind: TableKind;
  counter_number: number | null;
  customer_label: string | null;
  /** "Mesa 4" o "Para llevar #12 · Ana", listo para mostrar. */
  place_label: string;
  table_session_id: string;
  session_status: TableSessionStatus;
  status: BillStatus;
  subtotal: number;
  discount_total: number;
  total: number;
  paid_total: number;
  tip_total: number;
  balance: number;
  split_mode: SplitMode;
  split_parts: number;
  next_equal_share: number | null;
  active_orders: number;
  can_close: boolean;
  opened_by: string | null;
  opened_at: string;
  paid_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  orders: BillOrder[];
  discounts: BillDiscount[];
  payments: BillPayment[];
  /** order_item_id -> cantidad ya pagada (pagos COMPLETED). */
  items_paid_qty: Record<string, number>;
};

export type OpenBillSummary = {
  id: string;
  bill_number: number;
  table_id: string;
  table_number: number;
  table_name: string | null;
  /** Venta de mostrador (C3): "COUNTER", con su "#N" y nombre opcional. */
  table_kind: TableKind;
  counter_number: number | null;
  customer_label: string | null;
  /** "Mesa 4" o "Para llevar #12 · Ana", listo para mostrar. */
  place_label: string;
  table_session_id: string;
  session_status: TableSessionStatus;
  status: BillStatus;
  total: number;
  paid_total: number;
  balance: number;
  split_mode: SplitMode;
  split_parts: number;
  opened_at: string;
  active_orders: number;
};

export type RecordPaymentResult = {
  payment_id: string;
  change_amount: number | null;
  /** true si la clave de idempotencia ya existía: no se cobró de nuevo. */
  replayed: boolean;
  closed?: boolean;
  bill: Bill;
};

/** Vista del cliente (anon). null si no hay cuenta o el cobro está apagado. */
export type SessionBill = {
  bill_number: number;
  status: BillStatus;
  subtotal: number;
  discount_total: number;
  total: number;
  paid_total: number;
  tip_total: number;
  balance: number;
  split_mode: SplitMode;
  split_parts: number;
  paid_at: string | null;
  closed_at: string | null;
} | null;

export type CashSessionOpened = {
  id: string;
  register_id: string;
  register_name: string;
  status: CashSessionStatus;
  opened_by: string | null;
  opened_at: string;
  opening_float: number;
};

export type CashMovement = {
  id: string;
  type: CashMovementType;
  reason: CashMovementReason;
  amount: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
  replayed?: boolean;
};

export type CashMethodSummary = {
  method: PaymentMethod;
  expected: number;
  counted: number | null;
  difference: number | null;
  payments_total: number;
  tips_total: number;
};

/**
 * Resumen de turno. Con can_see_expected = false (mesero, cierre ciego)
 * solo vienen los campos base, antes y después del cierre: esperados,
 * conteos y diferencias existen solo en cash_session_counts (OWNER/ADMIN).
 */
export type CashSessionSummary = {
  id: string;
  register_id?: string;
  register_name?: string;
  status: CashSessionStatus;
  opened_by?: string | null;
  opened_at?: string;
  opening_float?: number;
  closed_by?: string | null;
  closed_at: string | null;
  payments_count?: number;
  can_see_expected: boolean;
  notes?: string | null;
  /** Efectivo. Solo OWNER/ADMIN: la tabla cash_sessions no guarda estos montos. */
  expected_cash?: number;
  counted_cash?: number | null;
  cash_difference?: number | null;
  /** Suma de todos los métodos (cash_session_counts). Solo OWNER/ADMIN. */
  expected_total?: number;
  counted_total?: number | null;
  difference_total?: number | null;
  by_method?: CashMethodSummary[];
  movements?: CashMovement[];
  voided_payments_count?: number;
};

/** Respuesta de create_counter_sale (C5). `replayed` = reintento con la misma clave. */
export type CounterSale = {
  order_id: string;
  bill_id: string;
  bill_number: number;
  table_session_id: string;
  counter_number: number;
  customer_label: string | null;
  place_label: string;
  replayed: boolean;
  bill: Bill;
};
