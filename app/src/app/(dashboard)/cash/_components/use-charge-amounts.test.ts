import { describe, expect, it } from "vitest";
import { computeChargeAmounts } from "./use-charge-amounts";
import type { Bill, BillItem } from "@/types/billing";

function item(id: string, quantity: number, unit_price: number, subtotal: number): BillItem {
  return { id, product_id: null, product_name: id, quantity, unit_price, subtotal, notes: null };
}

function bill(items: BillItem[], extra: Partial<Bill> = {}): Bill {
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  return {
    split_mode: "ITEMS",
    balance: total,
    next_equal_share: null,
    items_paid_qty: {},
    orders: [{ id: "o1", order_number: 1, status: "DELIVERED", total, created_at: "", billable: true, items }],
    ...extra,
  } as Bill;
}

describe("computeChargeAmounts — pay by item", () => {
  it("without promo suggests quantity × unit price", () => {
    const b = bill([item("a", 2, 3, 6), item("b", 1, 4, 4)]);
    const r = computeChargeAmounts(b, { a: true });
    expect(r.suggestedAmount).toBe(6);
    expect(r.paymentItems).toEqual([{ order_item_id: "a", quantity: 2 }]);
  });

  it("with a 2x1 promo suggests the net subtotal, not the list price", () => {
    // 2 × $2.50 with 10% + 2x1: list $5.00, the line pays $2.25.
    const b = bill([item("a", 2, 2.5, 2.25), item("b", 1, 4, 4)]);
    expect(computeChargeAmounts(b, { a: true }).suggestedAmount).toBe(2.25);
    expect(computeChargeAmounts(b, { a: true, b: true }).suggestedAmount).toBe(6.25);
  });

  it("partially paid line: the remaining units absorb the rounding", () => {
    // 3 units for $10.00 net; one unit already paid ($3.33) → $6.67 left.
    const b = bill([item("a", 3, 4, 10)], { items_paid_qty: { a: 1 }, balance: 6.67 });
    const r = computeChargeAmounts(b, { a: true });
    expect(r.remainingByItem).toEqual({ a: 2 });
    expect(r.paymentItems).toEqual([{ order_item_id: "a", quantity: 2 }]);
    expect(r.suggestedAmount).toBe(6.67);
  });

  it("is capped at the balance (manual discounts on top) and skips paid lines", () => {
    const b = bill([item("a", 2, 3, 6)], { balance: 5 });
    expect(computeChargeAmounts(b, { a: true }).suggestedAmount).toBe(5);
    const paid = bill([item("a", 2, 3, 6)], { items_paid_qty: { a: 2 } });
    expect(computeChargeAmounts(paid, { a: true })).toMatchObject({ paymentItems: undefined, suggestedAmount: 0 });
  });
});

describe("computeChargeAmounts — other modes keep their behavior", () => {
  it("NONE suggests the balance and EQUAL the next share", () => {
    const items = [item("a", 2, 3, 6)];
    expect(computeChargeAmounts(bill(items, { split_mode: "NONE" }), { a: true })).toMatchObject({ suggestedAmount: 6, paymentItems: undefined });
    expect(computeChargeAmounts(bill(items, { split_mode: "EQUAL", next_equal_share: 3 }), {}).suggestedAmount).toBe(3);
    expect(computeChargeAmounts(null, {})).toEqual({ remainingByItem: {}, paymentItems: undefined, suggestedAmount: 0 });
  });
});
