import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
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
          response = NextResponse.next({ request });
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

  const path = request.nextUrl.pathname;
  const isStaffArea = STAFF_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (!user && isStaffArea) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
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
  "/reports",
  "/inventory",
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
    "/reports/:path*",
    "/inventory/:path*",
  ],
};
