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
