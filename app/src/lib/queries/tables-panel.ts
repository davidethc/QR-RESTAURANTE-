import { createClient } from "@/lib/supabase/server";
import { getTablesStatus } from "@/lib/queries/staff";
import type { TableStatus } from "@/config/constants";

export type PanelOrder = {
  id: string;
  folio: number;
  shortCode: string;
  total: number;
  status: string;
  isNew: boolean;
};

export type PanelTable = {
  id: string;
  number: number;
  name: string | null;
  shape: "square" | "round";
  col: number | null;
  row: number | null;
  widthCells: number;
  heightCells: number;
  zoneId: string;
  status: TableStatus;
  /** Sesión ACTIVE de la mesa (también la recién abierta, sin comandas). */
  sessionId: string | null;
  customerLabel: string | null;
  orders: PanelOrder[];
  billRequested: boolean;
  waiterRequested: boolean;
  total: number;
  billStatus: string | null;
  billBalance: number | null;
};

export type PanelZone = {
  id: string;
  name: string;
  gridCols: number;
  gridRows: number;
  tables: PanelTable[];
};

/** Zonas con sus mesas posicionadas y el estado vivo de cada una (M04-T05). */
export async function getTablesPanel(restaurantId: string): Promise<PanelZone[]> {
  const supabase = await createClient();
  const [zonesRes, tablesRes, statuses, sessionsRes, callsRes] = await Promise.all([
    supabase
      .from("zones")
      .select("id, name, grid_cols, grid_rows")
      .eq("restaurant_id", restaurantId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("tables")
      .select("id, number, name, shape, col, row, width_cells, height_cells, zone_id")
      .eq("restaurant_id", restaurantId)
      .not("zone_id", "is", null)
      .order("number"),
    getTablesStatus(restaurantId),
    supabase
      .from("table_sessions")
      .select("id, table_id, customer_label")
      .eq("restaurant_id", restaurantId)
      .eq("status", "ACTIVE")
      .order("started_at", { ascending: false }),
    supabase
      .from("waiter_calls")
      .select("table_id, type")
      .eq("restaurant_id", restaurantId)
      .eq("status", "PENDING"),
  ]);
  if (zonesRes.error) throw zonesRes.error;
  if (tablesRes.error) throw tablesRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (callsRes.error) throw callsRes.error;

  const sessionByTable = new Map<string, { id: string; label: string | null }>();
  for (const s of sessionsRes.data ?? []) {
    if (!sessionByTable.has(s.table_id)) {
      sessionByTable.set(s.table_id, { id: s.id, label: s.customer_label });
    }
  }
  const sessionIds = [...sessionByTable.values()].map((s) => s.id);

  const [ordersRes, billsRes] = sessionIds.length
    ? await Promise.all([
        supabase
          .from("orders")
          .select("id, folio, short_code, total, status, status_review, table_session_id, created_at")
          .in("table_session_id", sessionIds)
          .eq("cancelled", false)
          .not("status", "in", "(CANCELLED,REJECTED)")
          .order("created_at"),
        supabase
          .from("bills")
          .select("table_session_id, status, balance")
          .in("table_session_id", sessionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (ordersRes.error) throw ordersRes.error;
  if (billsRes.error) throw billsRes.error;

  const ordersBySession = new Map<string, PanelOrder[]>();
  for (const o of ordersRes.data ?? []) {
    if (!o.table_session_id) continue;
    const list = ordersBySession.get(o.table_session_id) ?? [];
    list.push({
      id: o.id,
      folio: o.folio,
      shortCode: o.short_code,
      total: Number(o.total),
      status: o.status,
      isNew: o.status_review === "new",
    });
    ordersBySession.set(o.table_session_id, list);
  }
  const billBySession = new Map<string, { status: string; balance: number }>();
  for (const b of billsRes.data ?? []) {
    billBySession.set(b.table_session_id, { status: b.status, balance: Number(b.balance) });
  }
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const tables: PanelTable[] = (tablesRes.data ?? []).map((t) => {
    const st = statusById.get(t.id);
    const session = sessionByTable.get(t.id) ?? null;
    const orders = session ? (ordersBySession.get(session.id) ?? []) : [];
    const bill = session ? billBySession.get(session.id) : undefined;
    const calls = (callsRes.data ?? []).filter((c) => c.table_id === t.id);
    return {
      id: t.id,
      number: t.number,
      name: t.name,
      shape: t.shape === "round" ? "round" : "square",
      col: t.col,
      row: t.row,
      widthCells: t.width_cells,
      heightCells: t.height_cells,
      zoneId: t.zone_id as string,
      status: st?.status ?? "AVAILABLE",
      sessionId: session?.id ?? null,
      customerLabel: session?.label ?? null,
      orders,
      billRequested: st?.status === "BILL_REQUESTED" || calls.some((c) => c.type === "BILL"),
      waiterRequested: calls.some((c) => c.type === "WAITER"),
      total: orders.reduce((sum, o) => sum + o.total, 0),
      billStatus: bill?.status ?? null,
      billBalance: bill?.balance ?? null,
    };
  });

  return (zonesRes.data ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    gridCols: z.grid_cols,
    gridRows: z.grid_rows,
    tables: tables.filter((t) => t.zoneId === z.id),
  }));
}

export type HistoryItem = {
  name: string;
  quantity: number;
  subtotal: number;
  notes: string | null;
};

export type HistoryOrder = {
  id: string;
  folio: number;
  shortCode: string;
  name: string;
  createdAt: string;
  paymentState: "Pagado" | "Pago parcial" | "Sin cobrar" | "Cancelado" | "Anulado";
  total: number;
  cancelReason: string | null;
  items: HistoryItem[];
};

/** Pedidos de mesa ya cerrados o cancelados, para consulta (M04-T08). */
export async function getTablesHistory(restaurantId: string): Promise<HistoryOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, folio, short_code, total, cancelled, cancel_reason, created_at, table_session_id, tables(number, name), table_sessions(status, customer_label), order_items(product_name, quantity, subtotal, notes, cancelled)"
    )
    .eq("restaurant_id", restaurantId)
    .eq("service_type", "table")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const sessionIds = (data ?? []).map((o) => o.table_session_id).filter((x): x is string => !!x);
  const bills = sessionIds.length
    ? await supabase
        .from("bills")
        .select("table_session_id, status, paid_total, total")
        .in("table_session_id", sessionIds)
    : { data: [], error: null };
  if (bills.error) throw bills.error;
  const billBySession = new Map((bills.data ?? []).map((b) => [b.table_session_id, b]));

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (data ?? [])
    .filter((o) => o.cancelled || one(o.table_sessions)?.status !== "ACTIVE")
    .map((o) => {
      const table = one(o.tables);
      const session = one(o.table_sessions);
      const bill = o.table_session_id ? billBySession.get(o.table_session_id) : undefined;
      let paymentState: HistoryOrder["paymentState"] = "Sin cobrar";
      if (o.cancelled) paymentState = "Cancelado";
      else if (bill?.status === "VOID") paymentState = "Anulado";
      else if (bill?.status === "PAID" || bill?.status === "CLOSED") paymentState = "Pagado";
      else if (bill && Number(bill.paid_total) > 0) paymentState = "Pago parcial";
      return {
        id: o.id,
        folio: o.folio,
        shortCode: o.short_code,
        name:
          session?.customer_label ||
          (table ? (table.name ?? `Mesa ${table.number}`) : "Mesa"),
        createdAt: o.created_at,
        paymentState,
        total: Number(o.total),
        cancelReason: o.cancel_reason,
        items: (o.order_items ?? [])
          .filter((i) => !i.cancelled)
          .map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            subtotal: Number(i.subtotal),
            notes: i.notes,
          })),
      };
    });
}
