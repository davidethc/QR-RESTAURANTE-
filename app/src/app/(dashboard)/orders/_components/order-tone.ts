import { ChefHat, CircleCheck, Clock, Flame } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PosTone } from "@/components/shared/pos-tone";
import type { OrderStatus } from "@/config/constants";

/**
 * Estado del pedido como lo lee el mesero: color + icono + texto, con los
 * mismos tonos de Caja (ámbar = te toca, azul = cocina trabajando, verde =
 * listo para llevar).
 */
export const ORDER_STATUS_META: Partial<Record<OrderStatus, { tone: PosTone; icon: LucideIcon; label: string }>> = {
  PENDING: { tone: "attention", icon: Clock, label: "Por aprobar" },
  ACCEPTED: { tone: "info", icon: ChefHat, label: "Aceptado · en cola" },
  PREPARING: { tone: "info", icon: Flame, label: "En cocina" },
  READY: { tone: "money-in", icon: CircleCheck, label: "Listo · por entregar" },
};
