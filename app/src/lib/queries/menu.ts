import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicMenu } from "@/types/menu";

async function fetchPublicMenu(slug: string): Promise<PublicMenu> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_public_menu", {
    p_slug: slug,
  });

  if (error) throw error;
  return data as unknown as PublicMenu;
}

/**
 * Carta pública del restaurante: una sola llamada a la base, cacheada
 * 5 minutos — la carta no cambia entre un cliente y el siguiente.
 * Cuando el panel de administración (Fase 5) edite un producto,
 * `revalidateTag('menu-<slug>')` la refresca al instante.
 */
export async function getPublicMenu(slug: string): Promise<PublicMenu> {
  return unstable_cache(fetchPublicMenu, ["public-menu", slug], {
    revalidate: 300,
    tags: [`menu-${slug}`],
  })(slug);
}

export async function getProductById(productId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (error) throw error;
  return data;
}
