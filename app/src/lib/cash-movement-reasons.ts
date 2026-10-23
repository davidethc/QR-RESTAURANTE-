import { CASH_MOVEMENT_REASON, CASH_MOVEMENT_TYPE } from "@/config/constants";
import type { CashMovementReason, CashMovementType } from "@/config/constants";

/**
 * Motivos de "Meter dinero" y "Sacar dinero" (POS). Cada dirección muestra
 * solo los suyos: antes un solo desplegable mezclaba entradas y salidas y no
 * se entendía hacia dónde iba el dinero. Se mapean a los tipos y motivos que
 * ya acepta `add_cash_movement` (sin cambiar el contrato). "Otro" exige una
 * nota de al menos 3 letras (la RPC lo vuelve a validar).
 */
export type CashDirection = "IN" | "OUT";

export interface CashReasonOption {
  reason: CashMovementReason;
  label: string;
  hint: string;
  /** Nombre del icono de lucide (lo resuelve el componente). */
  icon: "PiggyBank" | "CirclePlus" | "Receipt" | "Truck" | "HandCoins" | "Landmark" | "Undo2" | "CircleMinus";
  requiresNote: boolean;
}

export const CASH_REASONS: Record<CashDirection, CashReasonOption[]> = {
  IN: [
    {
      reason: CASH_MOVEMENT_REASON.FLOAT_TOPUP,
      label: "Refuerzo de fondo",
      hint: "Traes cambio o sencillo para la caja.",
      icon: "PiggyBank",
      requiresNote: false,
    },
    {
      reason: CASH_MOVEMENT_REASON.OTHER,
      label: "Otro ingreso",
      hint: "Cualquier otra entrada. Escribe de qué es.",
      icon: "CirclePlus",
      requiresNote: true,
    },
  ],
  OUT: [
    { reason: CASH_MOVEMENT_REASON.EXPENSE, label: "Gasto", hint: "Compra menor: hielo, gas, limpieza.", icon: "Receipt", requiresNote: false },
    { reason: CASH_MOVEMENT_REASON.SUPPLIER_PAYMENT, label: "Pago a proveedor", hint: "Le pagas a quien te entrega mercadería.", icon: "Truck", requiresNote: false },
    { reason: CASH_MOVEMENT_REASON.TIPS_PAYOUT, label: "Reparto de propinas", hint: "Entregas las propinas al equipo.", icon: "HandCoins", requiresNote: false },
    { reason: CASH_MOVEMENT_REASON.WITHDRAWAL, label: "Retiro", hint: "Sacas efectivo para guardarlo o depositarlo.", icon: "Landmark", requiresNote: false },
    { reason: CASH_MOVEMENT_REASON.REFUND, label: "Devolución", hint: "Le devuelves dinero a un cliente.", icon: "Undo2", requiresNote: false },
    { reason: CASH_MOVEMENT_REASON.OTHER, label: "Otro", hint: "Cualquier otra salida. Escribe de qué es.", icon: "CircleMinus", requiresNote: true },
  ],
};

export function movementType(direction: CashDirection): CashMovementType {
  return direction === "IN" ? CASH_MOVEMENT_TYPE.IN : CASH_MOVEMENT_TYPE.OUT;
}

/** Qué falta para poder registrar (null = listo). Mismas reglas que la RPC. */
export function movementBlockReason(
  option: CashReasonOption | null,
  amount: number,
  note: string
): string | null {
  if (!option) return "Elige el motivo.";
  if (!(amount > 0)) return "Escribe el monto.";
  if (option.requiresNote && note.trim().length < 3) return "Escribe de qué es (mínimo 3 letras).";
  return null;
}
