"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markDelivered } from "@/lib/actions/orders";
import { notify } from "@/lib/notifications";
import { notifyStaff } from "@/lib/notifications-staff";

export const DELIVERY_UNDO_MS = 5000;

type Scheduled = {
  timer: ReturnType<typeof setTimeout>;
  toastId: string | number;
};

/**
 * "Entregado" con arrepentimiento: el pedido se esconde al instante y se
 * muestra un toast con "Deshacer", pero `mark_order_delivered` recién se
 * llama cuando vencen los segundos. Entregar saca la comanda de la
 * pantalla de cocina, así que un toque equivocado no puede ser definitivo.
 *
 * - Deshacer: se cancela el temporizador y la tarjeta vuelve.
 * - Salir de la pantalla antes de tiempo: se confirma en ese momento (el
 *   mesero ya dijo "entregado" y no deshizo).
 * - Cerrar la pestaña o perder la página: el pedido queda sin entregar,
 *   que es el fallo seguro.
 */
export function useDeferredDelivery(
  onCommitted: (orderId: string) => void | Promise<void>
) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const scheduled = useRef(new Map<string, Scheduled>());
  const onCommittedRef = useRef(onCommitted);
  useEffect(() => {
    onCommittedRef.current = onCommitted;
  });

  const release = useCallback((orderId: string) => {
    setPendingIds((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  }, []);

  const commit = useCallback(
    async (orderId: string) => {
      scheduled.current.delete(orderId);
      const result = await markDelivered(orderId);
      if (!result.ok) {
        notify.error(result.error);
        release(orderId);
        return;
      }
      // Primero se saca de la lista y recién después se suelta el
      // "pendiente": si no, la tarjeta reaparece un instante hasta que
      // llega la recarga.
      await onCommittedRef.current(orderId);
      release(orderId);
    },
    [release]
  );

  const undo = useCallback(
    (orderId: string) => {
      const entry = scheduled.current.get(orderId);
      if (!entry) return;
      clearTimeout(entry.timer);
      scheduled.current.delete(orderId);
      notifyStaff.dismiss(entry.toastId);
      release(orderId);
    },
    [release]
  );

  const scheduleDelivery = useCallback(
    (orderId: string, title: string) => {
      if (scheduled.current.has(orderId)) return;
      setPendingIds((prev) => new Set(prev).add(orderId));
      const toastId = notifyStaff.deliveryUndoable(
        title,
        DELIVERY_UNDO_MS,
        () => undo(orderId)
      );
      const timer = setTimeout(() => void commit(orderId), DELIVERY_UNDO_MS);
      scheduled.current.set(orderId, { timer, toastId });
    },
    [commit, undo]
  );

  useEffect(() => {
    const pending = scheduled.current;
    return () => {
      for (const [orderId, { timer, toastId }] of pending) {
        clearTimeout(timer);
        notifyStaff.dismiss(toastId);
        void markDelivered(orderId).then((result) => {
          if (!result.ok) notify.error(result.error);
        });
      }
      pending.clear();
    };
  }, []);

  return { pendingIds, scheduleDelivery };
}
