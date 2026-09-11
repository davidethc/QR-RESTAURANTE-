"use client";

import { useCallback, useMemo, useState } from "react";
import type { StaffCartItem } from "@/types/menu";

/**
 * El pedido que el mesero va armando mientras el cliente se lo dicta.
 *
 * A diferencia del carrito del cliente, este NO se guarda en `localStorage`:
 * es una atención que empieza y termina en la mesa, en un par de minutos. Si
 * el mesero sale de la pantalla, salió; y en una tablet compartida entre
 * turnos, un carrito a medias que sobrevive es un pedido equivocado esperando
 * a pasar.
 *
 * Las líneas se identifican por producto: pedir dos veces lo mismo suma
 * cantidad en vez de abrir una segunda línea, salvo que lleven indicaciones
 * distintas (un "sin cebolla" no se puede fusionar con uno normal).
 */
export function useStaffCart() {
  const [items, setItems] = useState<StaffCartItem[]>([]);

  const addItem = useCallback(
    (product: { id: string; name: string; price: number }, notes = "") => {
      setItems((current) => {
        const index = current.findIndex(
          (item) => item.productId === product.id && item.notes === notes
        );

        if (index === -1) {
          return [
            ...current,
            {
              id: crypto.randomUUID(),
              productId: product.id,
              name: product.name,
              price: product.price,
              quantity: 1,
              notes,
            },
          ];
        }

        return current.map((item, i) =>
          i === index ? { ...item, quantity: item.quantity + 1 } : item
        );
      });
    },
    []
  );

  // Por id y no por índice: si se quita una línea mientras se edita otra,
  // los índices se corren y el cambio caería en el plato equivocado.

  /** Bajar a cero quita la línea: es como se borra sin un botón aparte. */
  const setQuantity = useCallback((id: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((item) => item.id !== id)
        : current.map((item) =>
            item.id === id ? { ...item, quantity } : item
          )
    );
  }, []);

  const setNotes = useCallback((id: string, notes: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, notes } : item))
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

  /** Cuántas unidades de un producto van ya en el pedido. */
  const quantityOf = useCallback(
    (productId: string) =>
      items.reduce(
        (sum, item) => (item.productId === productId ? sum + item.quantity : sum),
        0
      ),
    [items]
  );

  return {
    items,
    addItem,
    setQuantity,
    setNotes,
    clear,
    total,
    count,
    quantityOf,
  };
}
