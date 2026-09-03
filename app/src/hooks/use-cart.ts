"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartItem, PublicProduct } from "@/types/menu";

/**
 * Carrito en localStorage (decisión V2 §57 — no se persiste en Postgres
 * hasta que se confirma el pedido). Se guarda por restaurante+mesa, no
 * por sesión: el token de sesión es una cookie httpOnly, invisible para
 * este hook a propósito — el carrito no necesita saberlo, solo el
 * Server Action que envía el pedido lo lee del lado del servidor.
 */
function storageKey(slug: string, tableNumber: number): string {
  return `mk_cart_${slug}_${tableNumber}`;
}

function readCart(key: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function useCart(slug: string, tableNumber: number) {
  const key = storageKey(slug, tableNumber);
  // Empieza vacío siempre: leer localStorage en el useState inicial hace
  // que el servidor (sin localStorage) y el cliente (con un carrito ya
  // guardado) rendericen árboles distintos — el clásico mismatch de
  // hidratación (mismo tipo de bug que ElapsedTimer, aquí en otro archivo).
  // El carrito real se carga recién en el useEffect, solo en el cliente.
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(readCart(key));
  }, [key]);

  // Sincroniza si el carrito cambia en otra pestaña de la misma mesa.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === key) setItems(readCart(key));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next);
      window.localStorage.setItem(key, JSON.stringify(next));
    },
    [key]
  );

  const addItem = useCallback(
    (product: PublicProduct, quantity: number, notes: string) => {
      persist([
        ...items,
        { product, quantity, notes, subtotal: product.price * quantity },
      ]);
    },
    [items, persist]
  );

  // Para agregar varios de una vez (p. ej. un combo plato+bebida) —
  // llamar addItem() dos veces seguidas perdería el primero, porque
  // ambas llamadas parten del mismo `items` capturado en el cierre
  // antes de que la primera termine de actualizar el estado.
  const addItems = useCallback(
    (entries: { product: PublicProduct; quantity: number; notes: string }[]) => {
      persist([
        ...items,
        ...entries.map((e) => ({
          ...e,
          subtotal: e.product.price * e.quantity,
        })),
      ]);
    },
    [items, persist]
  );

  const removeItem = useCallback(
    (index: number) => {
      persist(items.filter((_, i) => i !== index));
    },
    [items, persist]
  );

  const updateQuantity = useCallback(
    (index: number, quantity: number) => {
      if (quantity <= 0) return removeItem(index);
      persist(
        items.map((item, i) =>
          i === index
            ? { ...item, quantity, subtotal: item.product.price * quantity }
            : item
        )
      );
    },
    [items, persist, removeItem]
  );

  const clearCart = useCallback(() => persist([]), [persist]);

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    addItem,
    addItems,
    removeItem,
    updateQuantity,
    clearCart,
    total,
    itemCount,
  };
}
