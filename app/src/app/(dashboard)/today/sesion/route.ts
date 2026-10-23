/**
 * Latido de sesión del panel. No hace nada por sí mismo: su valor está en
 * que la petición pasa por `proxy.ts` (cubierta por `/today/:path*`), que
 * valida la sesión y el dispositivo (M10). Si el dispositivo fue revocado o
 * la sesión expiró, el proxy responde con una redirección y este handler no
 * llega a correr.
 *
 * Existe porque las lecturas del panel van directo del navegador a Supabase
 * y ya no pasan por el proxy: sin este latido, una tablet revocada que no
 * navega seguiría recibiendo pedidos en vivo.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
