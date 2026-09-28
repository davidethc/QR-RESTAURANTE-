/**
 * Traduce un error de Supabase/PostgREST a un mensaje apto para el usuario.
 *
 * Solo P0001 (RAISE EXCEPTION de nuestras RPCs) trae un texto pensado para
 * mostrarse. Cualquier otro código (constraint, tipo, permisos, PostgREST,
 * red) es interno: se registra en el servidor con `context` y el usuario ve
 * un mensaje genérico. Así una columna, un nombre de política o un detalle
 * de la base nunca llega a la pantalla.
 */

export const GENERIC_DB_ERROR = "No se pudo completar la operación. Intenta de nuevo.";

export interface DbErrorLike {
  message: string;
  code?: string | null;
}

export function userFacingDbError(
  error: DbErrorLike,
  context: string,
  fallback: string = GENERIC_DB_ERROR
): string {
  if (error.code === "P0001" && error.message) return error.message;
  console.error(`[${context}]`, error.code ?? "sin código", error.message);
  return fallback;
}

/** Atajo para las actions: `return dbFailure(error, "createOrder")`. */
export function dbFailure(
  error: DbErrorLike,
  context: string,
  fallback?: string
): { ok: false; error: string } {
  return { ok: false, error: userFacingDbError(error, context, fallback) };
}
