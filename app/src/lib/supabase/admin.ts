import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la llave secreta: salta RLS y administra cuentas de acceso.
 * Solo para crear/bloquear cuentas del personal, y siempre DESPUÉS de que una
 * RPC con la sesión del usuario confirmó que tiene permiso.
 * Devuelve null si la llave no está configurada.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminClientConfigured(): boolean {
  return !!process.env.SUPABASE_SECRET_KEY;
}
