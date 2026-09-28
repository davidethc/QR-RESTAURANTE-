"use client";

import { useCallback, useRef } from "react";
import { newRequestId } from "@/lib/request-id";

/**
 * Clave de idempotencia atada a un contenido (`fingerprint`).
 *
 * - Mismo contenido → misma clave: si el primer envío llegó a la base pero
 *   la respuesta se perdió (wifi del local), el reintento no duplica nada.
 * - Contenido distinto → clave nueva: reutilizar la clave con otro carrito
 *   haría que la base devuelva el resultado del envío anterior.
 * - `renew()` tras un envío exitoso o al descartar: el próximo es otro envío.
 *
 * Se lee solo en handlers (nunca en el render), así que vive en un ref.
 */
export function useIdempotencyKey(fingerprint: string) {
  const ref = useRef<{ fingerprint: string; key: string } | null>(null);

  const get = useCallback(() => {
    if (!ref.current || ref.current.fingerprint !== fingerprint) {
      ref.current = { fingerprint, key: newRequestId() };
    }
    return ref.current.key;
  }, [fingerprint]);

  const renew = useCallback(() => {
    ref.current = null;
  }, []);

  return { get, renew };
}
