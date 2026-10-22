/** Contadores unificados del personal (M09): lógica pura, sin red. */

export interface StaffCounters {
  active_tables: number;
  bill_requested: number;
  waiter_requested: number;
  unreviewed_tickets: number;
  tickets_to_prepare: number;
  unreviewed_orders: number;
}

export const EMPTY_COUNTERS: StaffCounters = {
  active_tables: 0,
  bill_requested: 0,
  waiter_requested: 0,
  unreviewed_tickets: 0,
  tickets_to_prepare: 0,
  unreviewed_orders: 0,
};

function toCount(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Normaliza el JSON de `get_staff_counters`; lo desconocido cuenta como 0. */
export function parseStaffCounters(raw: unknown): StaffCounters {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    active_tables: toCount(o.active_tables),
    bill_requested: toCount(o.bill_requested),
    waiter_requested: toCount(o.waiter_requested),
    unreviewed_tickets: toCount(o.unreviewed_tickets),
    tickets_to_prepare: toCount(o.tickets_to_prepare),
    unreviewed_orders: toCount(o.unreviewed_orders),
  };
}

/**
 * Badge por ruta del menú. Mesas: lo que pide atención del mesero. Pedidos:
 * comandas del QR y pedidos web sin revisar. Cocina: comandas por preparar.
 */
export function navBadgeFor(href: string, c: StaffCounters): number {
  switch (href) {
    case "/tables":
      return c.bill_requested + c.waiter_requested + c.unreviewed_tickets;
    case "/orders":
      return c.unreviewed_orders + c.unreviewed_tickets;
    case "/kitchen":
      return c.tickets_to_prepare;
    default:
      return 0;
  }
}

/** "99+" para no desbordar la insignia. */
export function formatBadge(n: number): string {
  return n > 99 ? "99+" : String(n);
}
