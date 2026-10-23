import { Armchair, BellRing, QrCode, Receipt, Users, type LucideIcon } from "lucide-react";
import type { PosTone } from "@/components/shared/pos-tone";
import type { PanelTable } from "@/lib/queries/tables-panel";

export type TableStateKey = "free" | "occupied" | "bill" | "qr" | "waiter";

export type TableStateMeta = {
  key: TableStateKey;
  label: string;
  /** One line that tells the waiter what to do next. */
  hint: string;
  tone: PosTone;
  icon: LucideIcon;
};

export const TABLE_STATES: Record<TableStateKey, TableStateMeta> = {
  free: { key: "free", label: "Libre", hint: "Lista para el próximo cliente", tone: "neutral", icon: Armchair },
  occupied: { key: "occupied", label: "Ocupada", hint: "Clientes en la mesa", tone: "info", icon: Users },
  bill: { key: "bill", label: "Pide cuenta", hint: "Lleva la cuenta a la mesa", tone: "attention", icon: Receipt },
  qr: { key: "qr", label: "QR pendiente", hint: "Pedido del QR esperando aprobación", tone: "attention", icon: QrCode },
  waiter: { key: "waiter", label: "Llamando al mesero", hint: "Un cliente está llamando", tone: "money-out", icon: BellRing },
};

/** Legend order: from calm to urgent. */
export const LEGEND: TableStateKey[] = ["free", "occupied", "qr", "bill", "waiter"];

export function tableLabel(t: Pick<PanelTable, "name" | "number">) {
  return t.name ?? `Mesa ${t.number}`;
}

/** A table is occupied with an open session, even before its first ticket. */
export function isOccupied(t: PanelTable, justOpened: Record<string, string>) {
  return t.status !== "AVAILABLE" || !!t.sessionId || t.id in justOpened;
}

/**
 * Every state that applies to the table, most urgent first. The first one
 * paints the tile; the rest show as small badges so nothing is hidden.
 */
export function tableStates(t: PanelTable, occupied: boolean): TableStateMeta[] {
  const list: TableStateMeta[] = [];
  if (t.waiterRequested) list.push(TABLE_STATES.waiter);
  if (t.pendingApproval > 0) list.push(TABLE_STATES.qr);
  if (t.billRequested) list.push(TABLE_STATES.bill);
  if (list.length === 0) list.push(occupied ? TABLE_STATES.occupied : TABLE_STATES.free);
  return list;
}

/** Open bill balance, or null when the table has no open bill yet. */
export function openBalance(t: PanelTable): number | null {
  if (t.billBalance === null || t.billStatus === "CLOSED" || t.billStatus === "VOID") return null;
  return t.billBalance;
}
