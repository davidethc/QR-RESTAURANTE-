"use client";

import { toast } from "sonner";
import { playAlertSound } from "@/lib/alert-sound";

/**
 * Avisos que exigen atención del personal. Van sobre `sonner`, igual que el
 * resto (ver `notifications.ts`), con el <Toaster> del layout raíz; solo
 * cambia lo que los hace distintos: duran 15 s y hacen sonido, porque son
 * los únicos que hay que ver desde el otro lado del salón.
 *
 * Antes iban sobre `goey-toast`, que arrastraba `framer-motion` al panel
 * para un efecto "gooey". Se quitó: el panel se siente más fluido sin ese
 * JS y los avisos se leen igual.
 *
 * Duración explícita para que ningún valor por defecto de la librería
 * acorte el aviso.
 */
const NOTICE_MS = 15_000;
const AUTO_DISMISS_MS = 2000;

/** "Ver": además de navegar, cierra el aviso (si no, se queda 15 s sobre la pestaña a la que se saltó). */
function viewAction(onView?: () => void) {
  if (!onView) return undefined;
  return {
    label: "Ver",
    onClick: () => {
      onView();
      toast.dismiss();
    },
  };
}

export const notifyStaff = {
  newOrder(orderNumber: number, tableNumber: number) {
    playAlertSound();
    toast.info(`Nuevo pedido #${orderNumber}`, {
      description: `Mesa ${tableNumber}`,
      duration: NOTICE_MS,
    });
  },
  orderReadyForStaff(orderNumber: number, tableNumber: number) {
    toast.warning(`Pedido #${orderNumber} listo`, {
      description: `Mesa ${tableNumber} está esperando`,
      duration: AUTO_DISMISS_MS,
    });
  },
  waiterCalled(tableNumber: number, onView?: () => void) {
    playAlertSound();
    toast.info(`Mesa ${tableNumber} solicita atención`, {
      duration: NOTICE_MS,
      action: viewAction(onView),
    });
  },
  billRequested(tableNumber: number, onView?: () => void) {
    playAlertSound();
    toast.info(`Mesa ${tableNumber} pidió la cuenta`, {
      duration: NOTICE_MS,
      action: viewAction(onView),
    });
  },
  /**
   * "Pedido entregado" con "Deshacer". El toast es solo la cara visible:
   * quien decide cuándo se llama de verdad a `mark_order_delivered` es el
   * temporizador de `useDeferredDelivery`, no el cierre del toast.
   * Devuelve el id para poder cerrarlo si se deshace o se sale de la
   * pantalla (con `dismiss(id)`).
   */
  deliveryUndoable(title: string, durationMs: number, onUndo: () => void) {
    return toast.success(title, {
      description: "Se confirma en unos segundos.",
      duration: durationMs,
      action: {
        label: "Deshacer",
        onClick: onUndo,
      },
    });
  },
  dismiss(id: string | number) {
    toast.dismiss(id);
  },
};
