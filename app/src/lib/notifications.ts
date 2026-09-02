"use client";

import { gooeyToast } from "@/components/ui/goey-toaster";

/**
 * Notificaciones del sistema, una función por evento real del negocio.
 * Las pantallas nunca llaman a gooeyToast directamente — así el tono,
 * el ícono y la urgencia de cada aviso quedan definidos en un solo lugar
 * y son consistentes entre cliente, mesero y cocina.
 */
export const notify = {
  // ── Genéricas: resultado de cualquier Server Action ──
  success(message: string) {
    gooeyToast.success(message);
  },
  error(message: string) {
    gooeyToast.error(message, {
      description: "Comprueba tu conexión e inténtalo nuevamente.",
    });
  },

  // ── Cliente ──
  orderPlaced(orderNumber: number) {
    gooeyToast.success(`Pedido #${orderNumber} enviado`, {
      description: "El restaurante ya lo recibió.",
    });
  },
  orderAccepted(orderNumber: number) {
    gooeyToast.info(`Pedido #${orderNumber} aceptado`, {
      description: "Pasó a cocina.",
    });
  },
  orderRejected(orderNumber: number, reason: string | null) {
    gooeyToast.error(`Pedido #${orderNumber} rechazado`, {
      description: reason ?? "El restaurante no pudo procesarlo.",
    });
  },
  orderReadyForCustomer(orderNumber: number) {
    gooeyToast.success(`Pedido #${orderNumber} listo`, {
      description: "Tu mesero lo traerá enseguida.",
    });
  },
  orderDelivered(orderNumber: number) {
    gooeyToast(`Pedido #${orderNumber} entregado`);
  },
  callAcknowledged() {
    gooeyToast.success("Un mesero fue avisado");
  },
  callInProgress(type: "WAITER" | "BILL") {
    gooeyToast.info(
      type === "BILL" ? "Tu mesero va por la cuenta" : "Tu mesero va en camino"
    );
  },
  callDone(type: "WAITER" | "BILL") {
    gooeyToast.success(type === "BILL" ? "Cuenta entregada" : "Solicitud atendida");
  },

  // ── Personal: eventos que exigen atención, más visibles ──
  newOrder(orderNumber: number, tableNumber: number) {
    gooeyToast.info(`Nuevo pedido #${orderNumber}`, {
      description: `Mesa ${tableNumber}`,
      showProgress: true,
      timing: { displayDuration: 6000 },
    });
  },
  orderReadyForStaff(orderNumber: number, tableNumber: number) {
    gooeyToast.warning(`Pedido #${orderNumber} listo`, {
      description: `Mesa ${tableNumber} está esperando`,
      showProgress: true,
      timing: { displayDuration: 6000 },
    });
  },
  waiterCalled(tableNumber: number) {
    gooeyToast.info(`Mesa ${tableNumber} solicita atención`, {
      showProgress: true,
    });
  },
  billRequested(tableNumber: number) {
    gooeyToast.info(`Mesa ${tableNumber} pidió la cuenta`, {
      showProgress: true,
    });
  },
};
