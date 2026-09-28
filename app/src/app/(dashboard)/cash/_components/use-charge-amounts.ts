"use client";

import { useMemo } from "react";
import { formatPrice } from "@/lib/utils";
import { splitEqually } from "@/lib/money";
import { SPLIT_MODE } from "@/config/constants";
import type { Bill } from "@/types/billing";

/**
 * Cálculos de presentación de la hoja de cobro, derivados de la cuenta que
 * devuelve la RPC y de los ítems marcados (modo "por ítems"). No decide
 * dinero: el monto definitivo lo valida y redondea record_payment.
 */
export function useChargeAmounts(bill: Bill | null, selectedItems: Record<string, boolean>) {
  // Cantidad restante por pagar de cada ítem (quantity - lo ya cobrado).
  const remainingByItem = useMemo(() => {
    const map: Record<string, number> = {};
    if (!bill) return map;
    for (const order of bill.orders) {
      if (!order.billable) continue;
      for (const item of order.items) {
        map[item.id] = item.quantity - (bill.items_paid_qty[item.id] ?? 0);
      }
    }
    return map;
  }, [bill]);

  const paymentItems = useMemo(() => {
    if (!bill || bill.split_mode !== SPLIT_MODE.ITEMS) return undefined;
    const list: { order_item_id: string; quantity: number }[] = [];
    for (const order of bill.orders) {
      for (const item of order.items) {
        const remaining = remainingByItem[item.id] ?? 0;
        if (selectedItems[item.id] && remaining > 0) {
          list.push({ order_item_id: item.id, quantity: remaining });
        }
      }
    }
    return list.length > 0 ? list : undefined;
  }, [bill, selectedItems, remainingByItem]);

  const itemsTotal = useMemo(() => {
    if (!bill || !paymentItems) return 0;
    let sum = 0;
    for (const order of bill.orders) {
      for (const item of order.items) {
        const sel = paymentItems.find((p) => p.order_item_id === item.id);
        if (sel) sum += sel.quantity * item.unit_price;
      }
    }
    return Math.min(Math.round(sum * 100) / 100, bill.balance);
  }, [bill, paymentItems]);

  const suggestedAmount = useMemo(() => {
    if (!bill) return 0;
    if (bill.split_mode === SPLIT_MODE.ITEMS) return itemsTotal;
    if (bill.split_mode === SPLIT_MODE.EQUAL) return bill.next_equal_share ?? bill.balance;
    return bill.balance;
  }, [bill, itemsTotal]);

  // Qué parte le toca cobrar ahora, para "Parte 2 de 3 · $3,33": cuenta
  // cuántas partes completas ya cubre lo pagado.
  const currentPartLabel = useMemo(() => {
    if (!bill || bill.split_mode !== SPLIT_MODE.EQUAL) return null;
    let shares: number[] = [];
    try {
      shares = splitEqually(bill.total, bill.split_parts);
    } catch {
      return null;
    }
    let paidCents = Math.round(bill.paid_total * 100);
    let idx = 0;
    for (const share of shares) {
      const shareCents = Math.round(share * 100);
      if (paidCents >= shareCents) {
        paidCents -= shareCents;
        idx++;
      } else break;
    }
    const current = Math.min(idx + 1, bill.split_parts);
    return `Parte ${current} de ${bill.split_parts} · ${formatPrice(bill.next_equal_share ?? shares[current - 1] ?? 0)}`;
  }, [bill]);

  return { remainingByItem, paymentItems, suggestedAmount, currentPartLabel };
}
