"use client";

import { useEffect, useMemo, useState } from "react";
import { getActivePromotions, getLinePromos, type LinePromo } from "@/lib/actions/promotions";
import { modifiersPrice } from "@/lib/order-lines";
import { estimateCartLine, roundCents, type LineEstimate } from "@/lib/promotions";
import type { ActivePromotion, PromotionChannel } from "@/types/promotions";
import type { StaffCartItem, StaffProductDetail } from "@/types/menu";

/**
 * Promotions active today for a channel, read once when the screen opens.
 * Display only (struck prices, estimated total): a failed read just shows
 * list prices, the server prices the order anyway.
 */
export function useActivePromotions(channel: PromotionChannel | null): ActivePromotion[] {
  const [promos, setPromos] = useState<ActivePromotion[]>([]);
  useEffect(() => {
    let cancelled = false;
    getActivePromotions(channel).then((r) => {
      if (!cancelled && r.ok) setPromos(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [channel]);
  return promos;
}

/**
 * Net subtotal and promo snapshot of lines already sent, keyed by line id.
 * Refetched when `version` changes (a new ticket, an edited or cancelled line).
 */
export function useLinePromos(lineIds: string[], version: string): Map<string, LinePromo> {
  const ids = lineIds.join(",");
  const [map, setMap] = useState<Map<string, LinePromo>>(() => new Map());
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    getLinePromos(ids.split(",")).then((r) => {
      if (!cancelled && r.ok) setMap(new Map(r.data.map((l) => [l.id, l])));
    });
    return () => {
      cancelled = true;
    };
  }, [ids, version]);
  return map;
}

/**
 * Display estimate of the cart with today's promotions: per line (list, off,
 * net, labels) and the total off. Mirrors the server formula only to show it;
 * the order RPC prices the lines.
 */
export function useCartPromoEstimate(
  items: StaffCartItem[],
  details: Record<string, StaffProductDetail> | undefined,
  categoryOf: Map<string, string>,
  promos: ActivePromotion[]
): { byLine: Map<string, LineEstimate>; discount: number } {
  return useMemo(() => {
    const byLine = new Map<string, LineEstimate>();
    if (promos.length === 0) return { byLine, discount: 0 };
    let discount = 0;
    for (const item of items) {
      const detail = details?.[item.productId];
      const variant = detail?.variants.find((v) => v.id === item.variantId);
      const variantPrice = variant?.price ?? item.price - modifiersPrice(detail?.groups ?? [], item.selections ?? {});
      const estimate = estimateCartLine(
        { productId: item.productId, categoryId: categoryOf.get(item.productId), variantPrice, unitPrice: item.price, quantity: item.quantity },
        promos
      );
      byLine.set(item.id, estimate);
      discount += estimate.discount;
    }
    return { byLine, discount: roundCents(discount) };
  }, [items, details, categoryOf, promos]);
}
