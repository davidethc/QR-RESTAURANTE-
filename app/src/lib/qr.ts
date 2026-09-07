/**
 * La URL que codifica el QR de una mesa.
 *
 * Vive en un solo sitio a propósito. Antes cada componente hacía
 * `${window.location.origin}/scan/${token}` por su cuenta, y eso es un
 * error que no tiene arreglo por software: el QR codifica el dominio
 * desde el que se abrió el panel. Si el dueño entra desde una URL de
 * vista previa de Vercel o desde localhost e imprime veinte adhesivos,
 * esos adhesivos apuntan al sitio equivocado **para siempre** — y ya
 * están pegados en las mesas.
 *
 * Por eso manda `NEXT_PUBLIC_SITE_URL`, y `window.location.origin`
 * queda solo como último recurso.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

export function getSiteOrigin(): string {
  if (SITE_URL) return SITE_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function buildScanUrl(qrToken: string): string {
  return `${getSiteOrigin()}/scan/${qrToken}`;
}

/** Direcciones con las que un QR impreso nace muerto, siempre. */
const NUNCA_IMPRIMIBLE = /^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:|$|\/)/;

/**
 * Si esto devuelve algo, hay que enseñarlo ANTES de imprimir: son los
 * casos en los que el QR quedaría inservible una vez pegado en la mesa.
 *
 * Avisa por dos motivos distintos:
 *
 * 1. La dirección nunca puede funcionar fuera de esta computadora
 *    (localhost o una IP), venga de donde venga.
 * 2. No hay `NEXT_PUBLIC_SITE_URL` y estamos adivinando el dominio del
 *    navegador — que es exactamente el caso de una vista previa.
 *
 * Deliberadamente NO se avisa por el dominio en sí cuando la variable
 * está puesta: el sitio de producción va a vivir en un `vercel.app`, y
 * un aviso que salta siempre es un aviso que se aprende a ignorar.
 */
export function getQrUrlWarning(): string | null {
  const origin = getSiteOrigin();

  if (!origin) {
    return "No hay dominio configurado. Define NEXT_PUBLIC_SITE_URL antes de imprimir.";
  }
  if (NUNCA_IMPRIMIBLE.test(origin)) {
    return `Este QR apunta a ${origin}, que solo funciona en esta computadora. No sirve para imprimir.`;
  }
  if (!SITE_URL) {
    return `No hay dominio configurado: el QR usará ${origin}, la dirección desde la que abriste el panel. Si esto es una vista previa, los códigos impresos dejarán de servir.`;
  }
  return null;
}
