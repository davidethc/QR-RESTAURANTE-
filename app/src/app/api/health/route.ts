import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Latido del sistema, para monitoreo externo.
 *
 * Existe por dos motivos que se resuelven con la misma ruta:
 *
 * 1. **Que Supabase no pause el proyecto.** Los proyectos del plan
 *    gratuito se pausan tras 7 días de poca actividad de base de
 *    datos. Un monitor externo llamando aquí cada pocos minutos genera
 *    de sobra la actividad que hace falta.
 * 2. **Enterarse si algo se cae.** La respuesta recorre la cadena
 *    completa —Vercel, Next y Postgres—, así que si cualquiera de las
 *    tres falla, el monitor lo ve y avisa.
 *
 * Detalle crítico: esta ruta NO se puede cachear. La carta pública sí
 * lo está (ver `lib/queries/menu.ts`), y por eso hacerle ping a ella NO
 * sirve para mantener viva la base: devolvería la copia del caché sin
 * tocar Postgres nunca. Si esta ruta se cachea, deja de cumplir su
 * único propósito y encima da falsa confianza: monitor en verde y base
 * pausándose igual.
 *
 * `await connection()` es lo que lo garantiza. Antes eran
 * `dynamic = "force-dynamic"` y `revalidate = 0`, que con Cache
 * Components activo ya no existen (todo es dinámico por defecto y esos
 * exports rompen el build). `connection()` marca explícitamente que
 * este handler solo puede correr con una petición real delante, lo que
 * además impide que el `Date.now()` de abajo se evalúe al construir.
 *
 * No devuelve ningún dato del negocio ni ninguna clave: solo si la base
 * respondió y a qué hora, que es todo lo que un monitor necesita.
 */
export async function GET() {
  await connection();
  const startedAt = Date.now();

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("health_check");

    if (error) throw new Error(error.message);

    return Response.json(
      { ok: true, db: data, ms: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // 503 y no 200: el código de estado es lo único que mira el
    // monitor. Devolver 200 con un cuerpo que diga "error" haría que
    // la base pudiera estar muerta con el panel en verde.
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown",
        ms: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
