import { DEVICE_COOKIE } from "@/lib/devices/constants";
import { checkDevice } from "@/lib/devices/service";
import { PANEL_PATH_HEADER } from "@/app/(dashboard)/_components/route-guard";
import type { Database } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Pasa al layout la ruta pedida (path + query): el permiso por rol se decide
 * allí, con el miembro que el layout ya lee (antes el proxy lo leía y el
 * layout otra vez: dos viajes a la base por navegación). Se sobrescribe
 * siempre, para que un cliente no pueda inyectar su propio valor.
 */
function forwardRequest(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PANEL_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  let response = forwardRequest(request);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = forwardRequest(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // No insertar código entre createServerClient y getClaims:
  // provoca cierres de sesión aleatorios.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  // Solo sesión y dispositivo viven aquí. El permiso por ruta lo aplica
  // `(dashboard)/layout.tsx` + `requireRouteAccess` en cada página.

  const path = request.nextUrl.pathname;
  const isStaffArea = STAFF_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  function redirectTo(destination: string, search = "") {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    url.search = search;
    const redirected = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
    return redirected;
  }

  // M10: un dispositivo vinculado se valida en cada request. Si lo revocaron,
  // se cierra la sesión y se borra la cookie; si no se pudo comprobar, no se
  // corta a nadie por un fallo de red (la revocación se aplica al volver).
  const deviceSecret = request.cookies.get(DEVICE_COOKIE)?.value;
  if (deviceSecret && isStaffArea) {
    const device = await checkDevice(deviceSecret);
    if (device.state === "revoked") {
      await supabase.auth.signOut();
      const redirected = redirectTo("/pin", "?motivo=revocado");
      redirected.cookies.delete(DEVICE_COOKIE);
      return redirected;
    }
  }

  if (!user && isStaffArea) {
    return redirectTo("/login");
  }

  return response;
}

// Toda ruta nueva del panel (src/app/(dashboard)/*) debe agregarse AQUÍ y en
// `config.matcher` de abajo (Next exige que el matcher sea literal). Si falta,
// la página se sirve sin exigir sesión: pasó con /cash el 2026-09-27.
const STAFF_PREFIXES = [
  "/orders",
  "/kitchen",
  "/menu",
  "/tables",
  "/settings",
  "/cash",
  "/staff",
  "/sales",
  "/today",
  "/reports",
  "/inventory",
  "/disponibilidad",
  "/ajustes",
  "/security",
  "/availability",
];

export const config = {
  // Solo el área de personal. El comensal no inicia sesión nunca, así que
  // hacerle pasar por aquí le costaba una llamada de red a Supabase Auth
  // (el getClaims de arriba) en cada carga Y en cada navegación, para
  // acabar cayendo siempre en el `return response` de abajo.
  matcher: [
    "/orders/:path*",
    "/kitchen/:path*",
    "/menu/:path*",
    "/tables/:path*",
    "/settings/:path*",
    "/cash/:path*",
    "/staff/:path*",
    "/sales/:path*",
    "/today/:path*",
    "/reports/:path*",
    "/inventory/:path*",
    "/disponibilidad/:path*",
    "/ajustes/:path*",
    "/security/:path*",
    "/availability/:path*",
  ],
};
