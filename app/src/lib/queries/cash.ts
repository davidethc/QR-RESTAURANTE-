import { createClient } from "@/lib/supabase/server";
import { fromUntyped } from "@/lib/supabase/untyped-table";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";

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

export interface ClosedBillToday {
  id: string;
  bill_number: number;
  table_number: number;
  table_name: string | null;
  total: number;
  closed_at: string;
}

/**
 * Cuentas CLOSED del día comercial de hoy, para "Cobradas hoy" (solo se
 * muestra en la UI a OWNER/ADMIN; `bills_select_staff` en RLS también deja
 * leer a WAITER, pero esa sección no se les pinta). El corte del día no es
 * medianoche UTC ni local: usa `business_today`/`business_day_bounds`
 * (M1, 20260926160000) para respetar el corte configurado del restaurante
 * (04:00 por defecto) en su zona horaria.
 */
export async function getClosedBillsToday(
  restaurantId: string
): Promise<ClosedBillToday[]> {
  const supabase = await createClient();

  const { data: today, error: todayError } = await callUntypedRpc<string>(
    supabase,
    "business_today",
    { p_restaurant_id: restaurantId }
  );
  if (todayError) throw todayError;

  const { data: boundsRows, error: boundsError } = await callUntypedRpc<
    { start_at: string; end_at: string }[]
  >(supabase, "business_day_bounds", {
    p_restaurant_id: restaurantId,
    p_from: today,
    p_to: today,
  });
  if (boundsError) throw boundsError;
  const bounds = boundsRows?.[0];
  if (!bounds) throw new Error("No se pudo calcular el día comercial");

  const { data, error } = await fromUntyped(supabase, "bills")
    .select("id, bill_number, total, closed_at, tables(number, name)")
    .eq("restaurant_id", restaurantId)
    .eq("status", "CLOSED")
    .gte("closed_at", bounds.start_at)
    .lt("closed_at", bounds.end_at)
    .order("closed_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string;
    bill_number: number;
    total: number;
    closed_at: string;
    tables: { number: number; name: string | null } | { number: number; name: string | null }[] | null;
  }>).map((row) => {
    const table = Array.isArray(row.tables) ? row.tables[0] : row.tables;
    return {
      id: row.id,
      bill_number: row.bill_number,
      total: row.total,
      closed_at: row.closed_at,
      table_number: table?.number ?? 0,
      table_name: table?.name ?? null,
    };
  });
}
