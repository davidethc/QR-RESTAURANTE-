import { z } from "zod";
import type { Database } from "@/types/database";

type SecurityEventRow = Database["public"]["Views"]["security_events"]["Row"];
/** La vista expone todo como nullable; estas columnas nunca lo son en la práctica. */
export type SecurityEvent = Omit<SecurityEventRow, "id" | "restaurant_id" | "group_key" | "created_at"> & { id: string; restaurant_id: string; group_key: string; created_at: string };
export const SECURITY_ACTIONS = {
  order_cancelled: "Pedido cancelado",
  bill_voided: "Cuenta anulada",
  refund: "Pago anulado",
  cash_withdrawal: "Retiro de caja",
  cash_deposit: "Ingreso a caja",
  cash_movement: "Movimiento de caja",
  cash_cut_difference: "Corte con diferencia",
  cash_cut: "Corte de caja",
  discount: "Descuento aplicado",
  discount_removed: "Descuento retirado",
  session_force_closed: "Sesión cerrada por el personal",
} as const;
export type SecurityAction = keyof typeof SECURITY_ACTIONS;
export type SecurityFilters = { from: string; to: string; action: SecurityAction | ""; member: string; page: number };
export type SecurityGroup = { key: string; createdAt: string; events: SecurityEvent[] };
export const SECURITY_PAGE_SIZE = 15;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha válida.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Elige una fecha válida.");
const filtersSchema = z.object({
  from: date, to: date,
  action: z.union([z.enum(Object.keys(SECURITY_ACTIONS) as [SecurityAction, ...SecurityAction[]]), z.literal("")]),
  member: z.union([z.uuid(), z.literal("")]),
  page: z.coerce.number().int().min(1).max(1_000_000),
}).refine((filters) => filters.from <= filters.to, { message: "La fecha inicial debe ser anterior o igual a la final." });

export function defaultSecurityFilters(now = new Date()): SecurityFilters {
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const first = new Date(`${to}T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 6);
  return { from: first.toISOString().slice(0, 10), to, action: "", member: "", page: 1 };
}

export function parseSecurityFilters(params: Record<string, string | string[] | undefined>, defaults: SecurityFilters): SecurityFilters {
  return filtersSchema.parse(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, params[key] ?? fallback])));
}

/** Fechas de calendario en la zona fija de Monky (M00), final exclusivo. */
export function securityDateBounds(filters: Pick<SecurityFilters, "from" | "to">) {
  const until = new Date(`${filters.to}T00:00:00-05:00`);
  until.setUTCDate(until.getUTCDate() + 1);
  return { from: new Date(`${filters.from}T00:00:00-05:00`).toISOString(), until: until.toISOString() };
}

export function filterSecurityEvents(events: readonly SecurityEvent[], restaurantId: string, filters: SecurityFilters): SecurityEvent[] {
  const bounds = securityDateBounds(filters);
  return events.filter((event) => event.restaurant_id === restaurantId
    && Date.parse(event.created_at) >= Date.parse(bounds.from) && Date.parse(event.created_at) < Date.parse(bounds.until)
    && (!filters.action || event.event_type === filters.action)
    && (!filters.member || event.actor_user_id === filters.member));
}

type GroupIndex = Pick<SecurityEvent, "id" | "group_key" | "created_at">;
export function paginateSecurityGroups(index: readonly GroupIndex[], requestedPage: number, size = SECURITY_PAGE_SIZE) {
  const sorted = [...index].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
  const keys = [...new Set(sorted.map((event) => event.group_key))];
  const pages = Math.max(1, Math.ceil(keys.length / size));
  const page = Math.min(requestedPage, pages);
  return { keys: keys.slice((page - 1) * size, page * size), total: keys.length, pages, page };
}

export function groupSecurityEvents(events: readonly SecurityEvent[]): SecurityGroup[] {
  const groups = new Map<string, SecurityGroup>();
  const sorted = [...events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
  for (const event of sorted) {
    const key = `${event.restaurant_id}:${event.group_key}`;
    const group = groups.get(key);
    if (group) group.events.push(event);
    else groups.set(key, { key: event.group_key, createdAt: event.created_at, events: [event] });
  }
  return [...groups.values()];
}

export function securityHistoryHref(filters: SecurityFilters, page = filters.page): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, page: String(page) });
  if (filters.action) params.set("action", filters.action);
  if (filters.member) params.set("member", filters.member);
  return `/security?${params}`;
}

export function securityEventOrderHref(event: SecurityEvent): string | null {
  return event.entity_type === "ORDER" && event.entity_id && z.uuid().safeParse(event.entity_id).success
    ? `/security/orders/${event.entity_id}` : null;
}
