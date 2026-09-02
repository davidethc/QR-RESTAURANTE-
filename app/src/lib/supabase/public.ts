import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cliente sin cookies para RPCs verdaderamente públicos (anon).
 * Necesario para poder envolver la consulta en unstable_cache — Next.js
 * no permite tocar cookies()/headers() dentro de una función cacheada.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
