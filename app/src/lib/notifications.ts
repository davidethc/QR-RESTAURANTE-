"use client";

import { gooeyToast } from "@/components/ui/goey-toaster";
import { playAlertSound } from "@/lib/alert-sound";

/**
 * Notificaciones del sistema, una función por evento real del negocio.
 * Las pantallas nunca llaman a gooeyToast directamente — así el tono,
 * el ícono y la urgencia de cada aviso quedan definidos en un solo lugar
 * y son consistentes entre cliente, mesero y cocina.
 *
 * Duración: todas desaparecen solas a los 2s (`AUTO_DISMISS_MS`) —
 * `timing.displayDuration` se pasa explícito en cada una porque el
 * `duration` del <GooeyToaster> global no se aplicaba de forma
 * confiable a los toasts que no traían su propia duración (revisado
 * en el código fuente de goey-toast). Las tres excepciones —
 * `newOrder`, `waiterCalled`, `billRequested` — no se cierran solas:
 * el personal tiene que atenderlas o cerrarlas a mano, para que un
 * pedido nuevo o un llamado de mesa no se pierdan de vista sin querer.
 */
const AUTO_DISMISS_MS = 2000;
const AUTO_DISMISS = { timing: { displayDuration: AUTO_DISMISS_MS } };

export const notify = {
  // ── Genéricas: resultado de cualquier Server Action ──
  success(message: string) {
    gooeyToast.success(message, AUTO_DISMISS);
  },
  error(message: string) {
    gooeyToast.error(message, {
      description: "Comprueba tu conexión e inténtalo nuevamente.",
      ...AUTO_DISMISS,
    });
  },

  // ── Cliente ──
  itemAdded(productName: string) {
    gooeyToast.success(`${productName} agregado`, AUTO_DISMISS);
  },
  orderPlaced() {
    gooeyToast.success("Pedido enviado", {
      description: "El restaurante ya lo recibió.",
      ...AUTO_DISMISS,
    });
  },
  orderAccepted(orderNumber: number) {
    gooeyToast.info(`Pedido #${orderNumber} aceptado`, {
      description: "Pasó a cocina.",
      ...AUTO_DISMISS,
    });
  },
  orderRejected(orderNumber: number, reason: string | null) {
    gooeyToast.error(`Pedido #${orderNumber} rechazado`, {
      description: reason ?? "El restaurante no pudo procesarlo.",
      ...AUTO_DISMISS,
    });
  },
  orderReadyForCustomer(orderNumber: number) {
    gooeyToast.success(`Pedido #${orderNumber} listo`, {
      description: "Tu mesero lo traerá enseguida.",
      ...AUTO_DISMISS,
    });
  },
  orderDelivered(orderNumber: number) {
    gooeyToast(`Pedido #${orderNumber} entregado`, AUTO_DISMISS);
  },
  callAcknowledged() {
    gooeyToast.success("Un mesero fue avisado", AUTO_DISMISS);
  },
  callInProgress(type: "WAITER" | "BILL") {
    gooeyToast.info(
      type === "BILL" ? "Tu mesero va por la cuenta" : "Tu mesero va en camino",
      AUTO_DISMISS
    );
  },
  callDone(type: "WAITER" | "BILL") {
    gooeyToast.success(
      type === "BILL" ? "Cuenta entregada" : "Solicitud atendida",
      AUTO_DISMISS
    );
  },

  // ── Personal: eventos que exigen atención — no se cierran solas ──
  // `duration: Infinity` explícito y sin `timing`: si se deja sin
  // duración y el toast trae descripción, la librería igual le pone
  // 4s por defecto — hay que decirle "nunca" a propósito.
  newOrder(orderNumber: number, tableNumber: number) {
    playAlertSound();
    gooeyToast.info(`Nuevo pedido #${orderNumber}`, {
      description: `Mesa ${tableNumber}`,
      duration: Infinity,
    });
  },
  orderReadyForStaff(orderNumber: number, tableNumber: number) {
    gooeyToast.warning(`Pedido #${orderNumber} listo`, {
      description: `Mesa ${tableNumber} está esperando`,
      showProgress: true,
      ...AUTO_DISMISS,
    });
  },
  waiterCalled(tableNumber: number, onView?: () => void) {
    playAlertSound();
    gooeyToast.info(`Mesa ${tableNumber} solicita atención`, {
      duration: Infinity,
      action: onView ? { label: "Ver", onClick: onView } : undefined,
    });
  },
  billRequested(tableNumber: number, onView?: () => void) {
    playAlertSound();
    gooeyToast.info(`Mesa ${tableNumber} pidió la cuenta`, {
      duration: Infinity,
      action: onView ? { label: "Ver", onClick: onView } : undefined,
    });
  },
};
