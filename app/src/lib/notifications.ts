"use client";

import { gooeyToast } from "@/components/ui/goey-toaster";
import { toast as sonnerToast } from "sonner";
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
 * `newOrder`, `waiterCalled`, `billRequested` — duran 15s
 * (`NOTICE_MS`), lo suficiente para verlas desde el otro lado del
 * salón.
 */
const AUTO_DISMISS_MS = 2000;
const AUTO_DISMISS = { timing: { displayDuration: AUTO_DISMISS_MS } };

/**
 * Un aviso de pedido o solicitud dura lo suficiente para verlo desde el
 * otro lado del salón, pero se va solo. Antes era `Infinity`: si el
 * mesero no tocaba "Ver", los avisos se apilaban durante todo el
 * servicio hasta tapar la pantalla. Lo que no se puede perder no se
 * confía a un toast — vive en la lista, que es donde el mesero mira.
 */
const NOTICE_MS = 15_000;

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
    gooeyToast.success(message, AUTO_DISMISS);
  },
  error(message: string) {
    if (SESSION_EXPIRED_MESSAGES.includes(message)) {
      gooeyToast.error("Tu sesión expiró", {
        description: "Escanea el código QR de tu mesa otra vez para seguir pidiendo.",
        timing: { displayDuration: 6000 },
      });
      return;
    }
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

  // ── Personal: eventos que exigen atención ──
  // Duración explícita: si se deja sin `duration` y el toast trae
  // descripción, la librería le pone 4 s por defecto, que no alcanza
  // para verlo desde el otro lado del salón.
  newOrder(orderNumber: number, tableNumber: number) {
    playAlertSound();
    gooeyToast.info(`Nuevo pedido #${orderNumber}`, {
      description: `Mesa ${tableNumber}`,
      duration: NOTICE_MS,
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
      duration: NOTICE_MS,
      // "Ver" no solo cambia de pestaña — también cierra el aviso, que
      // si no se queda 15 s justo encima de la pestaña de Solicitudes a
      // la que el mesero acaba de saltar.
      // `gooeyToast.dismiss()` (con o sin id) no lo cierra de forma
      // confiable en esta versión de la librería — su registro interno
      // de toasts activos queda desincronizado y el dismiss no tiene
      // efecto visible aunque no tire error. `sonner` (la librería
      // real detrás de goey-toast) sí lo hace bien llamada
      // directamente — es la misma que usa el botón "×" nativo del
      // toast, que sí cierra.
      action: onView
        ? {
            label: "Ver",
            onClick: () => {
              onView();
              sonnerToast.dismiss();
            },
          }
        : undefined,
    });
  },
  billRequested(tableNumber: number, onView?: () => void) {
    playAlertSound();
    gooeyToast.info(`Mesa ${tableNumber} pidió la cuenta`, {
      duration: NOTICE_MS,
      action: onView
        ? {
            label: "Ver",
            onClick: () => {
              onView();
              sonnerToast.dismiss();
            },
          }
        : undefined,
    });
  },
};
