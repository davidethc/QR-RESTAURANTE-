import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "mk_session";

/**
 * Una sesión de mesa en un celular dura 1 h 30 min desde que escaneó el
 * QR. Pasado ese tiempo se asume que el cliente ya se fue: el celular
 * vuelve a ver la carta en modo WhatsApp y no puede pedir a la mesa.
 * Volver a escanear el QR de la mesa la renueva por otra 1 h 30 min.
 *
 * Es absoluta (desde el escaneo), no por inactividad: el caso que
 * evita es alguien que se lleva la pestaña abierta a casa y sigue
 * mandando pedidos a una mesa que ya ocupa otra gente.
 */
export const TABLE_SESSION_MAX_AGE_SECONDS = 60 * 90;

export interface TableSession {
  sessionToken: string;
  restaurantSlug: string;
  tableNumber: number;
  /** Epoch ms del escaneo. */
  issuedAt: number;
}

/**
 * Guarda la sesión de mesa resuelta desde el QR. Solo puede llamarse
 * desde un Route Handler o Server Action — Next.js no permite escribir
 * cookies durante el render de un Server Component.
 */
export async function setTableSession(
  session: Omit<TableSession, "issuedAt">
): Promise<void> {
  const cookieStore = await cookies();
  const value: TableSession = { ...session, issuedAt: Date.now() };
  cookieStore.set(COOKIE_NAME, JSON.stringify(value), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TABLE_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

/** Momento (epoch ms) en que vence la sesión. */
export function getTableSessionExpiresAt(session: TableSession): number {
  return session.issuedAt + TABLE_SESSION_MAX_AGE_SECONDS * 1000;
}

/**
 * Lee la sesión de mesa activa del cliente. null si nunca escaneó o
 * venció. El vencimiento se comprueba también aquí y no solo con el
 * `maxAge` de la cookie: el navegador puede no haberla borrado aún, y
 * las cookies de antes de esta regla (8 h, sin `issuedAt`) no cuentan.
 */
export async function getTableSession(): Promise<TableSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.sessionToken === "string" &&
      typeof parsed.restaurantSlug === "string" &&
      typeof parsed.tableNumber === "number" &&
      typeof parsed.issuedAt === "number" &&
      Date.now() < getTableSessionExpiresAt(parsed)
    ) {
      return parsed as TableSession;
    }
  } catch {
    // cookie corrupta: se trata como si no existiera
  }
  return null;
}
