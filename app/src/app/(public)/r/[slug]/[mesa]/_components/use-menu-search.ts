"use client";

import { useDeferredValue, useMemo } from "react";
import { normalizeText } from "@/lib/utils";
import type { CartItem, PublicCategory, PublicProduct } from "@/types/menu";

export type MenuSearchResult = PublicProduct & { categoryName: string };

/**
 * Search of the customer menu, shared by `/r` and `/pedir`.
 *
 * The index is built once per menu: each keystroke only runs `includes()`
 * on pre-normalized text. Results are the same objects on every keystroke,
 * so a dish that stays in the list keeps its memoized card instead of
 * re-rendering. The list may lag one frame behind the input (deferred), so
 * typing always responds at once. `null` means "not searching".
 */
export function useMenuSearch(categories: readonly PublicCategory[], query: string): readonly MenuSearchResult[] | null {
  const index = useMemo(
    () =>
      categories.flatMap((category) =>
        category.products.map((product) => ({
          result: { ...product, categoryName: category.name },
          haystack: normalizeText(`${product.name} ${product.description ?? ""}`),
        }))
      ),
    [categories]
  );

  const deferredQuery = useDeferredValue(query);

  return useMemo(() => {
    const q = normalizeText(deferredQuery.trim());
    if (!q) return null;
    return index.filter((entry) => entry.haystack.includes(q)).map((entry) => entry.result);
  }, [index, deferredQuery]);
}

/** Units of each dish already in the cart, for the "N en tu pedido" badge. */
export function useCartQuantities(items: readonly CartItem[]): Record<string, number> {
  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) map[item.product.id] = (map[item.product.id] ?? 0) + item.quantity;
    return map;
  }, [items]);
}
