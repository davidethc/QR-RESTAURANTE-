import { fromCents, splitIncludedTax, toCents } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import type { Bill, BillItem } from "@/types/billing";
import type { TicketBill } from "@/types/printing";

/** Menu prices include IVA (owner decision, 2026-09-27). */
export const IVA_RATE_PCT = 15;

/** bill_json fields added by M13 that `types/billing.ts` does not declare yet. */
type PromoItem = BillItem & { promo_discount?: number | null; list_subtotal?: number | null };
type PromoBill = Bill & { promo_discount_total?: number | null };

/** Maps a bill to the ticket shape. Amounts are copied as returned; nothing is recomputed. */
export function toTicketBill(bill: PromoBill): TicketBill {
  const { baseCents, taxCents } = splitIncludedTax(toCents(bill.total), IVA_RATE_PCT);
  const lines = bill.orders
    .filter((o) => o.billable)
    .flatMap((o) => o.items as PromoItem[])
    .filter((i) => !i.cancelled);

  return {
    bill_number: bill.bill_number,
    status: bill.status,
    place_label: bill.place_label ?? bill.table_name ?? `Mesa ${bill.table_number}`,
    timestamp: bill.closed_at ?? bill.paid_at ?? new Date().toISOString(),
    lines: lines.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      product_name: i.product_name,
      variant_name: i.variant_name,
      options: (i.options ?? []).map((o) => ({ value_name: o.value_name, qty: o.qty, price_modifier: o.price_modifier })),
      notes: i.notes,
      subtotal: i.subtotal,
      promo_discount: i.promo_discount,
      list_subtotal: i.list_subtotal,
    })),
    subtotal: bill.subtotal,
    promo_discount_total: bill.promo_discount_total ?? 0,
    discounts: bill.discounts.map((d) => ({ id: d.id, reason: d.reason, amount: d.amount })),
    total: bill.total,
    balance: bill.balance,
    tip_total: bill.tip_total,
    payments: bill.payments
      .filter((p) => p.status === "COMPLETED")
      .map((p) => ({
        id: p.id,
        label: p.reference ? `${PAYMENT_METHOD_LABEL[p.method]} · ${p.reference}` : PAYMENT_METHOD_LABEL[p.method],
        amount: p.amount,
        tip_amount: p.tip_amount,
        tendered_amount: p.method === "CASH" ? p.tendered_amount : null,
        change_amount: p.method === "CASH" ? p.change_amount : null,
      })),
    tax: { ratePct: IVA_RATE_PCT, base: fromCents(baseCents), tax: fromCents(taxCents) },
  };
}
