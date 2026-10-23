/**
 * Lista "Por cobrar" de Caja (lógica pura): qué tipo de lugar es cada cuenta,
 * en qué estado está y en qué orden se muestra. El tipo sale del rótulo que
 * arma la base (`session_place_label`: "Mesa 4", "Para llevar #12",
 * "Domicilio #3 · Rappi", "Para comer aquí #5").
 */
export type PlaceKind = "TABLE" | "TAKEAWAY" | "DELIVERY" | "DINE_IN";

export type QueueTone = "attention" | "money-in" | "info";

export interface QueueStatus {
  tone: QueueTone;
  label: string;
}

interface QueueBill {
  table_kind: string;
  place_label: string;
  status: string;
  balance: number;
  paid_total: number;
  active_orders: number;
  opened_at: string;
}

export function placeKind(bill: Pick<QueueBill, "table_kind" | "place_label">): PlaceKind {
  if (bill.table_kind !== "COUNTER") return "TABLE";
  if (bill.place_label.startsWith("Domicilio")) return "DELIVERY";
  if (bill.place_label.startsWith("Para comer aquí")) return "DINE_IN";
  return "TAKEAWAY";
}

export function queueStatus(bill: Pick<QueueBill, "status" | "paid_total" | "balance">): QueueStatus {
  if (bill.status === "PAID" || (bill.balance <= 0 && bill.paid_total > 0)) {
    return { tone: "money-in", label: "Pagado · por entregar" };
  }
  if (bill.paid_total > 0) return { tone: "attention", label: "Pago parcial" };
  return { tone: "attention", label: "Por cobrar" };
}

/** Minutos desde que se abrió (nunca negativo). */
export function minutesOpen(openedAt: string, now: number): number {
  const t = Date.parse(openedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** "Ahora", "12 min", "1 h 05". */
export function formatElapsed(minutes: number): string {
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Orden: primero lo que hay que cobrar (con saldo), del más antiguo al más
 * nuevo; al final lo ya pagado que espera entrega.
 */
export function sortQueue<T extends Pick<QueueBill, "status" | "paid_total" | "balance" | "opened_at">>(bills: T[]): T[] {
  return [...bills].sort((a, b) => {
    const pa = queueStatus(a).tone === "money-in" ? 1 : 0;
    const pb = queueStatus(b).tone === "money-in" ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return Date.parse(a.opened_at) - Date.parse(b.opened_at);
  });
}
