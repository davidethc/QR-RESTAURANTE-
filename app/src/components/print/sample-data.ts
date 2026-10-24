import type { KitchenTicket } from "@/lib/kds";
import type { TicketBill } from "@/types/printing";

/** Invented sample for the live preview in Settings → Impresión. */
export const SAMPLE_TICKET_BILL: TicketBill = {
  bill_number: 128,
  status: "PAID",
  place_label: "Mesa 4",
  timestamp: "2026-09-29T20:02:00Z",
  lines: [
    {
      id: "s1",
      quantity: 2,
      product_name: "Hamburguesa clásica",
      variant_name: "Doble",
      options: [{ value_name: "Queso extra", qty: 1, price_modifier: 0.5 }],
      notes: "sin cebolla",
      subtotal: 13.5,
      promo_discount: 1.5,
      list_subtotal: 15,
    },
    { id: "s2", quantity: 1, product_name: "Limonada grande", variant_name: null, options: [], notes: null, subtotal: 3.5 },
  ],
  subtotal: 17,
  promo_discount_total: 1.5,
  discounts: [],
  total: 17,
  balance: 0,
  tip_total: 0,
  payments: [
    { id: "p1", label: "Efectivo", amount: 17, tip_amount: 0, tendered_amount: 20, change_amount: 3 },
  ],
  tax: { ratePct: 15, base: 14.78, tax: 2.22 },
};

export const SAMPLE_KITCHEN_TICKET: KitchenTicket = {
  ticket_id: "sample",
  number: 1,
  kitchen_status: "pending",
  is_new: false,
  created_at: "2026-09-29T20:02:00Z",
  completed_at: null,
  elapsed_seconds: 0,
  order_id: "sample",
  folio: 3,
  short_code: "A1B2C",
  service_type: "DINE_IN",
  order_status: "PREPARING",
  order_notes: "Alergia a los frutos secos",
  place_label: "Mesa 4",
  table_number: 4,
  customer_name: null,
  author_user_id: null,
  author_name: "Ana",
  source: "staff",
  lines: [
    {
      id: "k1",
      quantity: 2,
      product_name: "Hamburguesa clásica",
      variant_name: "Doble",
      notes: "sin cebolla",
      options: [
        { group: "Punto", name: "Término medio", qty: 1 },
        { group: "Extras", name: "Queso", qty: 2 },
        { group: "Extras", name: "Tocino", qty: 1 },
      ],
    },
    { id: "k2", quantity: 1, product_name: "Limonada grande", variant_name: null, notes: null, options: [] },
  ],
};
