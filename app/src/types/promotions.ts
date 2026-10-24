/**
 * M13 promotions. Shapes of the `promotions` table, `get_active_promotions`
 * and the per-line snapshot stored in `order_items.promotions` / bill_json.
 * Keep in sync with supabase/migrations/20261024100000_m13_promotions.sql.
 */

export type PromotionType = "discount" | "buy_x_get_y";
export type PromotionValueType = "percent" | "fixed";
export type PromotionAppliesTo = "products" | "categories";
export type PromotionStatus = "active" | "paused";

export type PromotionChannel =
  | "pos.tables"
  | "pos.dine_in_no_table"
  | "pos.takeaway"
  | "pos.delivery"
  | "digital_menu.tables"
  | "digital_menu.pickup"
  | "digital_menu.delivery";

export interface PromotionServiceOptions {
  pos: { tables: boolean; dine_in_no_table: boolean; takeaway: boolean; delivery: boolean };
  digital_menu: { tables: boolean; pickup: boolean; delivery: boolean };
}

/** The rule fields every promotion shape shares (row, active, snapshot). */
export interface PromotionRule {
  id: string;
  name: string;
  type: PromotionType;
  value_type: PromotionValueType | null;
  value: number | null;
  receive_qty: number | null;
  buy_qty: number | null;
}

/** Row of `promotions` (admin list). */
export interface Promotion extends PromotionRule {
  restaurant_id: string;
  applies_to: PromotionAppliesTo;
  target_ids: string[];
  weekdays: number[] | null;
  starts_on: string | null;
  ends_on: string | null;
  service_options: PromotionServiceOptions;
  status: PromotionStatus;
  created_at: string;
  updated_at: string;
}

/** Item of `get_active_promotions` (active today, local date). */
export interface ActivePromotion extends PromotionRule {
  applies_to: PromotionAppliesTo;
  target_ids: string[];
  service_options: PromotionServiceOptions;
  label: string;
}

/** Promo fields that bill_json and order_items add to each line (M13). */
export interface PromoLineFields {
  list_subtotal?: number;
  promo_discount?: number;
  promotions?: PromotionRule[] | null;
}

/** Status shown in the admin list ("Activa hoy", "Programada"...). */
export type PromotionDisplayStatus = "today" | "scheduled" | "expired" | "paused";
