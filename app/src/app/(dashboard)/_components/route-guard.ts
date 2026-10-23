import { getLandingPath, getRouteRedirect, type PermissionSource } from "@/lib/permissions";

/** Cabecera con la ruta pedida (path + query) que el proxy le pasa al layout. */
export const PANEL_PATH_HEADER = "x-monky-path";

/**
 * A dónde mandar a `member` si no debe ver `pathWithSearch`, o null si pasa.
 * Es la regla que antes vivía en el proxy: el proxy se queda con la sesión y
 * el dispositivo (M10) y la decisión por rol se toma una sola vez en el
 * layout, con el miembro que ya lee `getMyRestaurant`.
 *
 * `/today?entrada` es la entrada silenciosa tras el login: cada rol aterriza
 * en su pantalla.
 */
export function resolvePanelRedirect(
  member: PermissionSource,
  pathWithSearch: string
): string | null {
  const url = new URL(pathWithSearch, "http://panel.local");
  if (url.pathname === "/today" && url.searchParams.has("entrada")) {
    return getLandingPath(member);
  }
  return getRouteRedirect(member, url.pathname);
}
