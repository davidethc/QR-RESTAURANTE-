import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Select en una tabla que aún no está en database.ts (cobro y caja,
 * M6-M7: cash_registers, cash_sessions...). Mismo motivo que
 * callUntypedRpc: los tipos se regeneran después de aplicar las
 * migraciones, y mientras tanto TypeScript no conoce estas tablas.
 * Solo para lecturas simples ya protegidas por RLS (SELECT-only en
 * estas tablas: toda escritura pasa por RPC).
 * TODO: reemplazar por supabase.from(...) tipado tras regenerar database.ts.
 */
export function fromUntyped(supabase: SupabaseClient<Database>, table: string) {
  return supabase.from(table as never);
}
