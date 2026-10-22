/** Lógica pura del KDS (M05): colores del cronómetro, formato y conteo. */

export type TimerTone = "green" | "yellow" | "red";

export interface KdsThresholds {
  warn_minutes: number;
  alert_minutes: number;
}

export const DEFAULT_THRESHOLDS: KdsThresholds = { warn_minutes: 10, alert_minutes: 20 };

export interface KitchenLine {
  id: string;
  quantity: number;
  product_name: string;
  variant_name: string | null;
  notes: string | null;
  options: { group: string | null; name: string | null; qty: number | null }[];
}

export interface KitchenTicket {
  ticket_id: string;
  number: number;
  kitchen_status: "pending" | "completed";
  is_new: boolean;
  created_at: string;
  completed_at: string | null;
  elapsed_seconds: number;
  order_id: string;
  folio: number | string | null;
  short_code: string | null;
  service_type: string | null;
  order_status: string;
  order_notes: string | null;
  place_label: string | null;
  table_number: number | null;
  customer_name: string | null;
  author_user_id: string | null;
  author_name: string | null;
  source: "digital_menu" | "staff";
  lines: KitchenLine[];
}

export interface KitchenTicketsPayload {
  pending_count: number;
  total: number;
  kds_enabled: boolean;
  thresholds: KdsThresholds;
  tickets: KitchenTicket[];
}

/** verde: < warn; amarillo: warn..alert; rojo: >= alert. */
export function timerTone(elapsedMinutes: number, t: KdsThresholds): TimerTone {
  if (elapsedMinutes >= t.alert_minutes) return "red";
  if (elapsedMinutes >= t.warn_minutes) return "yellow";
  return "green";
}

/** "05:32", con tope "+99 min". */
export function formatTimer(elapsedSeconds: number): string {
  const s = Math.max(0, Math.floor(elapsedSeconds));
  const m = Math.floor(s / 60);
  if (m > 99) return "+99 min";
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Cuenta COMANDAS (tickets) pendientes, no pedidos distintos. */
export function countPendingTickets(tickets: Pick<KitchenTicket, "kitchen_status">[]): number {
  return tickets.filter((t) => t.kitchen_status === "pending").length;
}

export function pendingLabel(n: number): string {
  return n === 1 ? "1 comanda por preparar" : `${n} comandas por preparar`;
}

export function serviceLabel(t: KitchenTicket): string {
  switch (t.service_type) {
    case "DELIVERY":
      return "Domicilio";
    case "DINE_IN":
      return t.table_number != null ? `Mesa ${t.table_number}` : "En el local";
    case "TAKEAWAY":
      return "Para llevar";
    default:
      return t.place_label ?? "En el local";
  }
}
