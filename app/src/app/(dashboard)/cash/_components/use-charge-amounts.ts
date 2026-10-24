"use client";

import { useMemo } from "react";
import { SPLIT_MODE } from "@/config/constants";
import { roundCents, splitItemAmount } from "@/lib/promotions";
import type { Bill } from "@/types/billing";

export interface ChargeAmounts {
  remainingByItem: Record<string, number>;
  paymentItems: { order_item_id: string; quantity: number }[] | undefined;
  suggestedAmount: number;
}

/**
 * Pure part of the charge sheet math (tested without React). Pay by item
 * values each line by its NET subtotal (after promotions): a unit is worth
 * subtotal / quantity and the last unit absorbs the rounding to the cent.
 * Manual bill discounts stay out, as before; the amount is capped at the
 * balance. It does not decide money: record_payment validates the payment.
 */
export function computeChargeAmounts(bill: Bill | null, selectedItems: Record<string, boolean>): ChargeAmounts {
  const remainingByItem: Record<string, number> = {};
  if (!bill) return { remainingByItem, paymentItems: undefined, suggestedAmount: 0 };

  for (const order of bill.orders) {
    if (!order.billable) continue;
    for (const item of order.items) {
      remainingByItem[item.id] = item.quantity - (bill.items_paid_qty[item.id] ?? 0);
    }
  }

  if (bill.split_mode !== SPLIT_MODE.ITEMS) {
    const suggestedAmount = bill.split_mode === SPLIT_MODE.EQUAL ? (bill.next_equal_share ?? bill.balance) : bill.balance;
    return { remainingByItem, paymentItems: undefined, suggestedAmount };
  }

  const list: { order_item_id: string; quantity: number }[] = [];
  let sum = 0;
  for (const order of bill.orders) {
    for (const item of order.items) {
      const remaining = remainingByItem[item.id] ?? 0;
      if (!selectedItems[item.id] || remaining <= 0) continue;
      list.push({ order_item_id: item.id, quantity: remaining });
      sum += splitItemAmount(item, item.quantity - remaining, remaining);
    }
  }
  const paymentItems = list.length > 0 ? list : undefined;
  const suggestedAmount = paymentItems ? Math.min(roundCents(sum), bill.balance) : 0;
  return { remainingByItem, paymentItems, suggestedAmount };
}

/** Charge sheet amounts derived from the bill returned by the RPC and the checked items. */
export function useChargeAmounts(bill: Bill | null, selectedItems: Record<string, boolean>): ChargeAmounts {
  return useMemo(() => computeChargeAmounts(bill, selectedItems), [bill, selectedItems]);
}
