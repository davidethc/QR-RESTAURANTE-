import { TABLE_KIND, type TableKind } from "@/config/constants";

/**
 * Espejo en TS de `public.place_label` (migración C3): "Mesa 4" o
 * "Para llevar #12" / "Para llevar #12 · Ana". Se usa en consultas que
 * leen `tables`/`table_sessions` directo (sin pasar por una RPC que ya
 * traiga `place_label` calculado) — hoy solo "Cobradas hoy"
 * (`getClosedBillsToday`, lib/queries/cash.ts). Todo lo demás (bill_json,
 * get_staff_orders, list_open_bills) trae `place_label` listo desde la
 * base; usar ese campo siempre que exista en vez de recalcular acá.
 */
export function placeLabel(
  kind: TableKind,
  tableNumber: number,
  counterNumber: number | null,
  customerLabel: string | null
): string {
  if (kind === TABLE_KIND.COUNTER) {
    const trimmed = customerLabel?.trim();
    const suffix = trimmed ? ` · ${trimmed}` : "";
    return `Para llevar #${counterNumber ?? "?"}${suffix}`;
  }
  return `Mesa ${tableNumber}`;
}
