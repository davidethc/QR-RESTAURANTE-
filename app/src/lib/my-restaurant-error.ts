export type MyRestaurantFailure = "unauthenticated" | "no-restaurant" | "transient";

/**
 * Qué significa que `getMyRestaurant` haya fallado. Solo los dos primeros
 * justifican mandar a /login; cualquier otra cosa (red, timeout, la base
 * reiniciándose) es pasajera y debe mostrarse como error recuperable, no
 * cerrarle la pantalla al personal a mitad de servicio.
 *
 * - `No autenticado` (P0001 de la RPC) o un JWT inválido/vencido
 *   (PGRST301/PGRST303) o la RPC rechazada al rol anon (42501): no hay sesión.
 * - `Tu cuenta no está asignada a ningún restaurante`: sin membresía ACTIVE
 *   (nunca la tuvo o la desactivaron).
 */
export function classifyMyRestaurantError(error: unknown): MyRestaurantFailure {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === "PGRST301" || code === "PGRST303" || code === "42501") {
    return "unauthenticated";
  }
  if (code === "P0001") {
    if (message === "No autenticado") return "unauthenticated";
    if (message?.includes("no está asignada")) return "no-restaurant";
  }
  return "transient";
}
