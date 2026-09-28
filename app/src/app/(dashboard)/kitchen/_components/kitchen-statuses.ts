import type { OrderStatus } from "@/config/constants";
import type { StaffOrder } from "@/types/staff";

/**
 * Qué estados ve la cocina según el ajuste `kitchen_ready_step`.
 * Módulo sin "use client" a propósito: lo usan la página (servidor) y el
 * tablero (cliente).
 *
 * En modo "solo mirar" (false) no existe la columna "Para recoger": la
 * comanda sale de la pantalla cuando el mesero la marca entregada.
 */
export function kitchenStatuses(readyStep: boolean): OrderStatus[] {
  return readyStep
    ? ["ACCEPTED", "PREPARING", "READY"]
    : ["ACCEPTED", "PREPARING"];
}

/** Momento en que el pedido entró a cocina (no cuándo lo mandó el cliente:
 *  la espera hasta que el mesero lo acepta no es tiempo de cocina). */
export function sentToKitchenAt(order: StaffOrder): string {
  return order.preparing_at ?? order.accepted_at ?? order.created_at;
}
