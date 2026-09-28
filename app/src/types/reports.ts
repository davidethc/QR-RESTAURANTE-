import type { BillStatus, DiscountKind, PaymentMethod, UserRole } from "@/config/constants";

/**
 * Formas que devuelven las RPCs `report_*` (M14–M15, aún sin aplicar y sin
 * tipar en `database.ts`). Se llaman con `callUntypedRpc` — mantener en
 * sincronía con `wiki/syntheses/diseno-cobro-reportes-inventario.md` y con
 * las migraciones `app/supabase/migrations/20260927120*.sql`.
 */

export type ReportGranularity = "day" | "week" | "month";

export type SalesSummary = {
  from: string;
  to: string;
  timezone: string;
  bills_count: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  avg_ticket: number;
  tips: number;
  payments_count: number;
  collected: number;
  open_bills_count: number;
  open_bills_total: number;
  open_bills_balance: number;
  delivered_orders_count: number;
  delivered_orders_total: number;
};

export type SalesByPeriodRow = {
  period_start: string;
  period_end: string;
  bills_count: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  avg_ticket: number;
  tips: number;
  delivered_orders_total: number;
};

export type SalesByProductRow = {
  product_id: string | null;
  product_name: string;
  category_id: string | null;
  category_name: string | null;
  quantity: number;
  gross_sales: number;
  orders_count: number;
};

export type SalesByCategoryRow = {
  category_id: string | null;
  category_name: string;
  quantity: number;
  gross_sales: number;
  products_count: number;
  orders_count: number;
};

export type SalesByStaffRow = {
  user_id: string;
  full_name: string;
  member_role: UserRole | null;
  orders_accepted: number;
  orders_accepted_total: number;
  payments_count: number;
  payments_amount: number;
  tips_amount: number;
};

export type PaymentsByMethodRow = {
  method: PaymentMethod;
  payments_count: number;
  amount: number;
  tips: number;
  total_collected: number;
  voided_count: number;
  voided_amount: number;
};

export type PeakHoursRow = {
  isodow: number; // 1 = lunes ... 7 = domingo (día comercial)
  hour: number; // 0-23, hora local de reloj
  orders_count: number;
  items_count: number;
  orders_total: number;
};

export type PrepStage = "accept" | "prep" | "delivery" | "total";

export type PrepTimesRow = {
  stage: PrepStage;
  orders_count: number;
  discarded_count: number;
  avg_minutes: number | null;
  p50_minutes: number | null;
  p90_minutes: number | null;
};

export type DiscountRow = {
  discount_id: string;
  applied_at: string;
  business_date: string;
  bill_id: string;
  bill_number: number;
  bill_status: BillStatus;
  table_number: number | null;
  table_name: string | null;
  place_label: string | null;
  kind: DiscountKind;
  value: number;
  amount: number;
  reason: string | null;
  order_item_id: string | null;
  product_name: string | null;
  applied_by: string;
  applied_by_name: string;
};

export type ReportRange = {
  from: string;
  to: string;
};

/** Todo lo que necesita la pantalla de reportes para un rango dado. */
export type ReportsBundle = {
  summary: SalesSummary;
  byPeriod: SalesByPeriodRow[];
  byProduct: SalesByProductRow[];
  byCategory: SalesByCategoryRow[];
  byStaff: SalesByStaffRow[];
  byMethod: PaymentsByMethodRow[];
  peakHours: PeakHoursRow[];
  prepTimes: PrepTimesRow[];
  discounts: DiscountRow[];
};
