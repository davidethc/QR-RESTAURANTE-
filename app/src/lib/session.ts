import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "mk_session";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 horas: cubre una comida completa

export interface TableSession {
  sessionToken: string;
  restaurantSlug: string;
  tableNumber: number;
}

/**
 * Guarda la sesión de mesa resuelta desde el QR. Solo puede llamarse
 * desde un Route Handler o Server Action — Next.js no permite escribir
 * cookies durante el render de un Server Component.
 */
export async function setTableSession(session: TableSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/** Lee la sesión de mesa activa del cliente. null si nunca escaneó o expiró. */
export async function getTableSession(): Promise<TableSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.sessionToken === "string" &&
      typeof parsed.restaurantSlug === "string" &&
      typeof parsed.tableNumber === "number"
    ) {
      return parsed as TableSession;
    }
  } catch {
    // cookie corrupta: se trata como si no existiera
  }
  return null;
}
