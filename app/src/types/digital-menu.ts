/** M12 · Shapes returned by the digital-menu RPCs (see docs/pos-spec/tanda4-db.md). */

export type OnlineServiceType = "delivery" | "pickup";
export type OnlinePaymentMethod = "cash" | "card" | "transfer";
export type DigitalMenuStatus = "inactive" | "active" | "paused";
export type DigitalMenuReason = "paused" | "closed" | "inactive" | null;
export type WhatsappVolume = "lt_50" | "50_150" | "150_500" | "gt_500";
export type PausePreset = "15m" | "30m" | "45m" | "1h" | "2h" | "today" | "indefinite" | "custom";

export type OnlineOrderStep =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "expired"
  | "rejected"
  | "cancelled";

export interface DigitalMenuState {
  status: DigitalMenuStatus;
  accepting_orders: boolean;
  reason: DigitalMenuReason;
  paused_from: string | null;
  paused_until: string | null;
  open: boolean;
  always_open: boolean;
  next_open_at: string | null;
}

export interface DeliverySettings {
  shipping_cost_type: "quote" | "distance";
  free_shipping_enabled: boolean;
  free_shipping_min_amount: number | null;
  min_purchase_enabled: boolean;
  min_purchase_amount: number | null;
  delivery_time_min: number;
  delivery_time_max: number;
  pickup_time: number;
  /** Only in the staff settings payload. */
  unconfirmed_ttl_minutes?: number;
}

export interface BankDetails {
  holder: string | null;
  bank: string | null;
  account: string | null;
  card_number: string | null;
}

export interface ChannelPaymentMethods {
  cash: boolean;
  card: boolean;
  transfer: boolean;
  bank: BankDetails | null;
}

export type PaymentMethodsByChannel = Record<OnlineServiceType, ChannelPaymentMethods>;

export interface DigitalMenuPromotion {
  id: string;
  name: string;
  type: "discount" | "buy_x_get_y";
  value_type: "percent" | "fixed" | null;
  value: number | null;
  receive_qty: number | null;
  buy_qty: number | null;
  applies_to: "products" | "categories";
  target_ids: string[];
  channels: Record<OnlineServiceType, boolean>;
  label: string;
}

export interface DigitalMenuRestaurant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  phone?: string | null;
  address?: string | null;
  timezone?: string;
  whatsapp_number?: string | null;
}

/** get_digital_menu(p_slug). Inactive → only `restaurant` + `state`. */
export interface DigitalMenu {
  restaurant: DigitalMenuRestaurant;
  state: DigitalMenuState;
  delivery?: DeliverySettings;
  payment_methods?: PaymentMethodsByChannel;
  promotions?: DigitalMenuPromotion[];
  hidden_product_ids?: Record<OnlineServiceType, string[]>;
}

export interface OnlineQuoteLine {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  list_subtotal: number;
  promo_discount: number;
  subtotal: number;
  promotions: { id: string; name: string; label: string }[];
}

export interface OnlineQuoteThreshold {
  min_amount: number;
  remaining: number;
  reached: boolean;
}

export interface OnlineQuote {
  service_type: OnlineServiceType;
  lines: OnlineQuoteLine[];
  subtotal: number;
  promo_discount_total: number;
  shipping: { applies: boolean; type: string; pending: boolean; free: boolean };
  free_shipping: OnlineQuoteThreshold | null;
  min_purchase: OnlineQuoteThreshold | null;
}

export interface OnlineOrderItem {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  list_subtotal: number;
  promo_discount: number;
  subtotal: number;
  notes: string | null;
  promotions: string[];
  options: { name: string; value_name: string | null; qty: number | null; price_modifier: number | null }[];
}

/** Public order json (place/get/confirm_online_order). Never carries phone or address. */
export interface OnlineOrder {
  order_id: string;
  short_code: string | null;
  folio: number | null;
  service_type: OnlineServiceType;
  tracking_token: string;
  step: OnlineOrderStep;
  created_at: string;
  confirmed_at: string | null;
  expires_at: string | null;
  customer_name: string | null;
  preferred_payment_method: OnlinePaymentMethod | null;
  pays_with_amount: number | null;
  general_comment: string | null;
  subtotal: number;
  promo_discount_total: number;
  shipping_cost: number | null;
  shipping_pending: boolean;
  total: number;
  restaurant: { name: string; slug: string; logo_url: string | null; whatsapp_number: string | null };
  items: OnlineOrderItem[];
  replayed?: boolean;
}

/** get_digital_menu_settings(p_restaurant_id). */
export interface DigitalMenuSettings {
  slug: string;
  digital_menu_status: DigitalMenuStatus;
  paused_from: string | null;
  paused_until: string | null;
  whatsapp_number: string | null;
  whatsapp_monthly_volume: WhatsappVolume | null;
  state: DigitalMenuState;
  delivery: DeliverySettings;
  payment_methods: PaymentMethodsByChannel;
}

export interface OnlineAddress {
  calle: string;
  numero: string;
  colonia: string;
  entre_calles?: string;
  referencias?: string;
  lat?: number;
  lng?: number;
}

/** A web order waiting in Pedidos › En línea (staff view, no PII columns). */
export interface StaffOnlineOrder {
  id: string;
  orderNumber: number;
  folio: number | null;
  shortCode: string | null;
  serviceType: OnlineServiceType;
  status: string;
  statusReview: string | null;
  createdAt: string;
  confirmedAt: string | null;
  expiresAt: string | null;
  customerName: string | null;
  preferredPaymentMethod: OnlinePaymentMethod | null;
  paysWithAmount: number | null;
  generalComment: string | null;
  shippingCost: number | null;
  subtotal: number;
  total: number;
  items: { name: string; variantName: string | null; quantity: number; subtotal: number; notes: string | null }[];
}

export interface StaffOnlineContact {
  customerPhone: string | null;
  deliveryAddress: OnlineAddress | null;
}
