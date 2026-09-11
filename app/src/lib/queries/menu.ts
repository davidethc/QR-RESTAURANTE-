import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicMenu } from "@/types/menu";

/**
 * Carta pública del restaurante: una sola llamada a la base — la carta
 * no cambia entre un cliente y el siguiente. Cuando el panel edita un
 * producto, `updateTag('menu-<slug>')` (ver `lib/actions/menu.ts`) la
 * refresca al instante.
 *
 * `use cache: remote` y no `use cache` a secas: en Vercel cada petición
 * puede caer en una instancia distinta, y el caché en memoria no
 * sobrevive entre ellas — la carta se recalcularía contra Postgres una
 * y otra vez. `remote` la guarda en el caché compartido de la
 * plataforma, así que la primera visita de la mañana la paga y el resto
 * del servicio la lee de ahí.
 *
 * Sustituye a `unstable_cache`, que además de estar deprecada no le
 * dice nada a Next sobre qué se puede prerenderizar: es lo que permite
 * que la carta viaje en el shell estático y la navegación sea instantánea.
 */
export async function getPublicMenu(slug: string): Promise<PublicMenu> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(`menu-${slug}`);

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_public_menu", {
    p_slug: slug,
  });

  if (error) throw error;
  return data as unknown as PublicMenu;
}
