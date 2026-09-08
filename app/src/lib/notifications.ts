"use client";

import { toast } from "sonner";

/**
 * Notificaciones del sistema, una función por evento real del negocio.
 * Las pantallas nunca llaman a `toast` directamente — así el tono, el
 * ícono y la urgencia de cada aviso quedan definidos en un solo lugar y
 * son consistentes entre cliente, mesero y cocina.
 *
 * Va sobre `sonner`. Antes iba sobre `goey-toast`, que es un envoltorio
 * de sonner con un efecto visual "gooey" — pero arrastra `framer-motion`
 * como dependencia, y al estar montado en el layout raíz eso metía
 * ~60 KB comprimidos en el celular de cada comensal para pintar un
 * "Plato agregado". Los cuatro avisos del personal que sí justifican el
 * efecto (los que hay que ver desde el otro lado del salón) viven ahora
 * en `notifications-staff.ts`, que solo carga el panel.
 *
 * Duración: todas desaparecen solas a los 2 s (`AUTO_DISMISS_MS`).
 */
const AUTO_DISMISS_MS = 2000;
const AUTO_DISMISS = { duration: AUTO_DISMISS_MS };

// La sesión de mesa (la cookie que guarda el escaneo del QR) puede
// vencer o quedar inválida — el mensaje genérico de error ("Comprueba
// tu conexión e inténtalo nuevamente") no ayuda nada acá, porque el
// problema no es de conexión: hay que volver a escanear el QR. Estos
// son los textos exactos que devuelven los RPC de Postgres
// (create_customer_order, create_waiter_call) y las Server Actions
// (callWaiter, createOrder) cuando eso pasa.
const SESSION_EXPIRED_MESSAGES = [
  "Sesión de mesa inválida o expirada",
  "No encontramos tu mesa. Escanea el código QR nuevamente.",
];

export const notify = {
  // ── Genéricas: resultado de cualquier Server Action ──
  success(message: string) {
    toast.success(message, AUTO_DISMISS);
  },
  error(message: string) {
    if (SESSION_EXPIRED_MESSAGES.includes(message)) {
      toast.error("Tu sesión expiró", {
        description:
          "Escanea el código QR de tu mesa otra vez para seguir pidiendo.",
        duration: 6000,
      });
      return;
    }
    toast.error(message, {
      description: "Comprueba tu conexión e inténtalo nuevamente.",
      ...AUTO_DISMISS,
    });
  },

  // ── Cliente ──
  itemAdded(productName: string) {
    toast.success(`${productName} agregado`, AUTO_DISMISS);
  },
  orderPlaced() {
    toast.success("Pedido enviado", {
      description: "El restaurante ya lo recibió.",
      ...AUTO_DISMISS,
    });
  },
  orderAccepted(orderNumber: number) {
    toast.info(`Pedido #${orderNumber} aceptado`, {
      description: "Pasó a cocina.",
      ...AUTO_DISMISS,
    });
  },
  orderRejected(orderNumber: number, reason: string | null) {
    toast.error(`Pedido #${orderNumber} rechazado`, {
      description: reason ?? "El restaurante no pudo procesarlo.",
      ...AUTO_DISMISS,
    });
  },
  orderReadyForCustomer(orderNumber: number) {
    toast.success(`Pedido #${orderNumber} listo`, {
      description: "Tu mesero lo traerá enseguida.",
      ...AUTO_DISMISS,
    });
  },
  orderDelivered(orderNumber: number) {
    toast(`Pedido #${orderNumber} entregado`, AUTO_DISMISS);
  },
  callAcknowledged() {
    toast.success("Un mesero fue avisado", AUTO_DISMISS);
  },
  callInProgress(type: "WAITER" | "BILL") {
    toast.info(
      type === "BILL" ? "Tu mesero va por la cuenta" : "Tu mesero va en camino",
      AUTO_DISMISS
    );
  },
  callDone(type: "WAITER" | "BILL") {
    toast.success(
      type === "BILL" ? "Cuenta entregada" : "Solicitud atendida",
      AUTO_DISMISS
    );
  },
};
