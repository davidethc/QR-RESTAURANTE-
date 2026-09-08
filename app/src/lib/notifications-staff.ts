"use client";

import { gooeyToast } from "@/components/ui/goey-toaster";
import { toast as sonnerToast } from "sonner";
import { playAlertSound } from "@/lib/alert-sound";

/**
 * Avisos que exigen atención del personal. Van sobre `goey-toast` (y no
 * sobre `sonner` como el resto, ver `notifications.ts`) porque son los
 * únicos que hay que ver desde el otro lado del salón: duran 15 s, hacen
 * sonido y el efecto visual ayuda a que no pasen desapercibidos.
 *
 * Este módulo es la ÚNICA puerta de entrada de `goey-toast` —y por tanto
 * de `framer-motion`— al bundle. Solo lo importa el panel; si algún día
 * lo importa un componente del comensal, esos ~60 KB comprimidos vuelven
 * a viajar al celular de cada cliente.
 *
 * Duración explícita: si se deja sin `duration` y el toast trae
 * descripción, la librería le pone 4 s por defecto, que no alcanza.
 */
const NOTICE_MS = 15_000;
const AUTO_DISMISS = { timing: { displayDuration: 2000 } };

export const notifyStaff = {
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
