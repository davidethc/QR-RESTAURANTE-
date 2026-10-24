export type PrintFontSize = "small" | "normal" | "large";

/** Shape returned by get_printing_settings (M16). */
export interface PrintingSettings {
  customer_ticket_font_size: PrintFontSize;
  customer_ticket_header: string | null;
  customer_ticket_footer: string | null;
  kitchen_ticket_font_size: PrintFontSize;
  advanced_printing: boolean;
  advanced_printing_available: boolean;
  restaurant: {
    name: string;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    timezone: string;
  };
}

/** Editable subset saved with save_printing_settings. */
export interface PrintingDraft {
  customer_ticket_font_size: PrintFontSize;
  customer_ticket_header: string;
  customer_ticket_footer: string;
  kitchen_ticket_font_size: PrintFontSize;
}

/** Payload shape the customer ticket renders (a bill, preview or real). */
export interface TicketLine {
  id: string;
  quantity: number;
  product_name: string;
  variant_name?: string | null;
  options?: { value_name: string; qty: number; price_modifier: number }[];
  notes: string | null;
  subtotal: number;
  /** M13: present when a promotion applied to the line. */
  promo_discount?: number | null;
  list_subtotal?: number | null;
}

export interface TicketPayment {
  id: string;
  label: string;
  amount: number;
  tip_amount: number;
  tendered_amount: number | null;
  change_amount: number | null;
}

export interface TicketBill {
  bill_number: number;
  status: string;
  place_label: string;
  /** ISO timestamp shown on the ticket. */
  timestamp: string;
  lines: TicketLine[];
  subtotal: number;
  /** Sum of promo discounts, already inside subtotal (bill_json). */
  promo_discount_total: number;
  discounts: { id: string; reason: string; amount: number }[];
  total: number;
  balance: number;
  tip_total: number;
  payments: TicketPayment[];
  tax: { ratePct: number; base: number; tax: number } | null;
}
