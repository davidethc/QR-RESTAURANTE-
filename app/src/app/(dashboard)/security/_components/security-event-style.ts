import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Ban,
  Lock,
  LogOut,
  Percent,
  ShieldCheck,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { PosTone } from "@/components/shared/pos-tone";
import type { SecurityAction } from "@/lib/security-history";

/**
 * Cada tipo de evento con su icono y tono (rojo = sale dinero o se anula,
 * verde = entra, ámbar = revisar, azul = informativo). El texto del tipo
 * sigue viniendo de SECURITY_ACTIONS: el color nunca va solo.
 */
export const SECURITY_EVENT_STYLE: Record<SecurityAction, { icon: LucideIcon; tone: PosTone }> = {
  order_cancelled: { icon: XCircle, tone: "money-out" },
  bill_voided: { icon: Ban, tone: "money-out" },
  refund: { icon: Undo2, tone: "money-out" },
  cash_withdrawal: { icon: ArrowUpFromLine, tone: "money-out" },
  cash_deposit: { icon: ArrowDownToLine, tone: "money-in" },
  cash_movement: { icon: ArrowLeftRight, tone: "info" },
  cash_cut_difference: { icon: AlertTriangle, tone: "attention" },
  cash_cut: { icon: Lock, tone: "info" },
  discount: { icon: Percent, tone: "attention" },
  discount_removed: { icon: Percent, tone: "info" },
  session_force_closed: { icon: LogOut, tone: "attention" },
};

const FALLBACK = { icon: ShieldCheck, tone: "neutral" as PosTone };

export function securityEventStyle(type: string | null) {
  return (type && SECURITY_EVENT_STYLE[type as SecurityAction]) || FALLBACK;
}
