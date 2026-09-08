import "server-only";
import { createHash } from "node:crypto";
import { getTableSession } from "@/lib/session";

/**
 * Nombre del canal de Realtime por el que esta mesa recibe avisos.
 *
 * Es el SHA-256 del token de sesión, y se calcula SOLO en el servidor: al
 * navegador se le entrega el hash, nunca el token. La cookie `mk_session`
 * es httpOnly justamente para que ni un XSS pueda robarla, y pasarle el
 * token al cliente para suscribirse tiraría esa protección a la basura.
 *
 * El mismo hash lo calcula el trigger `notify_table_session_change()` en
 * Postgres con `encode(digest(session_token::text,'sha256'),'hex')` — si
 * alguna vez cambia aquí, hay que cambiarlo allí (y al revés).
 *
 * Por el canal solo viaja una señal vacía ("algo cambió"), nunca datos:
 * el cliente reacciona pidiéndolos con la Server Action, que sí valida la
 * cookie del lado del servidor.
 */
export function sessionChannelName(sessionToken: string): string {
  return `session:${createHash("sha256")
    .update(sessionToken.toLowerCase())
    .digest("hex")}`;
}

/** El canal de la sesión activa, o null si el cliente no está en una mesa. */
export async function getSessionChannelName(): Promise<string | null> {
  const session = await getTableSession();
  return session ? sessionChannelName(session.sessionToken) : null;
}
