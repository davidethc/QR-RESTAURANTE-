import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Llamada a una RPC que aún no está en database.ts (cobro y caja, M8–M12).
 * TODO: tipar tras regenerar database.ts y reemplazar por supabase.rpc(...).
 */
export async function callUntypedRpc<T>(
  supabase: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  return { data: (data ?? null) as T | null, error };
}
