"use client";

import { useCallback, useMemo, useState } from "react";
import { splitLineInList } from "@/lib/order-lines";
import type { StaffCartItem } from "@/types/menu";

export type NewCartLine = Omit<StaffCartItem, "id">;

/**
 * El pedido que el mesero va armando mientras el cliente se lo dicta.
 *
 * No se guarda en `localStorage`: es una atención que empieza y termina en
 * la mesa. Las líneas se fusionan si coinciden producto, variante, nota y
 * personalizaciones; "Separar uno" las vuelve a abrir en unidades.
 */
export function useStaffCart() {
  const [items, setItems] = useState<StaffCartItem[]>([]);

  const addLine = useCallback((line: NewCartLine) => {
    setItems((current) => {
      const index = current.findIndex(
        (i) =>
          i.productId === line.productId &&
          i.variantId === line.variantId &&
          i.notes === line.notes &&
          (i.modifiers ?? "") === (line.modifiers ?? "")
      );
      if (index === -1) return [...current, { ...line, id: crypto.randomUUID() }];
      return current.map((i, k) =>
        k === index ? { ...i, quantity: i.quantity + line.quantity } : i
      );
    });
  }, []);

  /** Atajo para productos sin variante (caja): suma una unidad. */
  const addItem = useCallback(
    (product: { id: string; name: string; price: number }, notes = "") =>
      addLine({ productId: product.id, name: product.name, price: product.price, quantity: 1, notes }),
    [addLine]
  );

  const setNotes = useCallback((id: string, notes: string) => {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, notes } : i)));
  }, []);

  /** Reemplaza el contenido de una línea (Editar), conservando su id. */
  const replaceLine = useCallback((id: string, line: NewCartLine) => {
    setItems((current) => current.map((i) => (i.id === id ? { ...line, id } : i)));
  }, []);

  /** Bajar a cero quita la línea. */
  const setQuantity = useCallback((id: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((i) => i.id !== id)
        : current.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((i) => i.id !== id));
  }, []);

  const splitOne = useCallback((id: string) => {
    setItems((current) =>
      splitLineInList(current, id, () => crypto.randomUUID())
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const { total, count } = useMemo(
    () => ({
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      count: items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    [items]
  );

  const quantityOf = useCallback(
    (productId: string) =>
      items.reduce(
        (sum, i) => (i.productId === productId ? sum + i.quantity : sum),
        0
      ),
    [items]
  );

  return { items, addItem, setNotes, addLine, replaceLine, setQuantity, remove, splitOne, clear, total, count, quantityOf };
}
