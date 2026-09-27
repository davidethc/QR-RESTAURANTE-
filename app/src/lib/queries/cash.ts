import { createClient } from "@/lib/supabase/server";
import { fromUntyped } from "@/lib/supabase/untyped-table";

/**
 * Lecturas simples de caja (M6) que no necesitan RPC: las tablas ya
 * tienen RLS de solo lectura para el personal (cash_registers_select_staff,
 * cash_sessions_select_staff). Los montos (esperado, conteo, diferencia)
 * NUNCA se leen así — esos solo salen de get_cash_session_summary
 * (src/lib/actions/cash.ts), que aplica el cierre ciego según el rol.
 */

export interface CashRegisterOption {
  id: string;
  name: string;
}

export async function getCashRegisters(
  restaurantId: string
): Promise<CashRegisterOption[]> {
  const supabase = await createClient();
  const { data, error } = await fromUntyped(supabase, "cash_registers")
    .select("id, name")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as unknown as CashRegisterOption[];
}

/** id del turno de caja OPEN del restaurante, o null si la caja está cerrada. */
export async function getOpenCashSessionId(
  restaurantId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await fromUntyped(supabase, "cash_sessions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export interface ClosedCashSessionRow {
  id: string;
  register_name: string | null;
  opened_at: string;
  closed_at: string;
  opening_float: number;
}

/**
 * Últimas sesiones CLOSED (solo id/fechas/fondo — RLS de `cash_sessions`
 * permite leer esto a cualquier staff, pero la sección "Cierres anteriores"
 * solo se muestra en la UI a OWNER/ADMIN). Los montos de esperado/contado/
 * diferencia de cada una salen de `get_cash_session_summary`, nunca de acá.
 */
export async function getClosedCashSessions(
  restaurantId: string,
  limit = 10
): Promise<ClosedCashSessionRow[]> {
  const supabase = await createClient();
  const { data, error } = await fromUntyped(supabase, "cash_sessions")
    .select("id, opened_at, closed_at, opening_float, cash_registers(name)")
    .eq("restaurant_id", restaurantId)
    .eq("status", "CLOSED")
    .order("closed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string;
    opened_at: string;
    closed_at: string;
    opening_float: number;
    cash_registers: { name: string } | { name: string }[] | null;
  }>).map((row) => ({
    id: row.id,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    opening_float: row.opening_float,
    register_name: Array.isArray(row.cash_registers)
      ? (row.cash_registers[0]?.name ?? null)
      : (row.cash_registers?.name ?? null),
  }));
}
