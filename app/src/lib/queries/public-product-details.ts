import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffModifierGroup, StaffProductDetail } from "@/types/menu";

/**
 * Variantes y extras de la carta para el QR del cliente. `get_public_menu`
 * no los trae y la RLS solo deja leerlos al personal, así que se leen en el
 * servidor con la llave de servicio, acotados al restaurante y a productos
 * activos. Solo viaja nombre/precio/reglas; el cobro lo recalcula la base.
 */
export async function getPublicProductDetails(
  restaurantId: string,
  slug: string
): Promise<Record<string, StaffProductDetail>> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(`menu-${slug}`);

  const supabase = createAdminClient();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, product_variants(id, name, price, position), product_modifier_groups(position, modifier_groups(id, name, min_select, max_select, allow_repeat, modifier_options(id, name, price, position)))"
    )
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (error) throw error;

  const out: Record<string, StaffProductDetail> = {};
  for (const p of data ?? []) {
    const variants = [...(p.product_variants ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ id, name, price }) => ({ id, name, price: Number(price) }));
    const groups: StaffModifierGroup[] = [...(p.product_modifier_groups ?? [])]
      .sort((a, b) => a.position - b.position)
      .flatMap((link) => {
        const g = Array.isArray(link.modifier_groups)
          ? link.modifier_groups[0]
          : link.modifier_groups;
        if (!g) return [];
        return [
          {
            id: g.id,
            name: g.name,
            min_select: g.min_select,
            max_select: g.max_select,
            allow_repeat: g.allow_repeat,
            options: [...(g.modifier_options ?? [])]
              .sort((a, b) => a.position - b.position)
              .map((o) => ({ id: o.id, name: o.name, price: Number(o.price) })),
          },
        ];
      });
    out[p.id] = { variants, groups };
  }
  return out;
}
