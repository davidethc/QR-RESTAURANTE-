import { createClient } from "@/lib/supabase/server";

export type AvailabilityItem = {
  /** Clave única en la lista: `variant:<id>` o `modifier_option:<id>`. */
  key: string;
  itemType: "variant" | "modifier_option";
  itemId: string;
  /** Variante: "Producto - Variante". Opción: nombre de la opción. */
  title: string;
  /** Variante: categoría. Opción: grupo de personalización. */
  subtitle: string | null;
  imageUrl: string | null;
  available: boolean;
};

type VariantRow = {
  id: string;
  name: string;
  position: number;
  products: {
    name: string;
    image_url: string | null;
    categories: { name: string } | null;
  } | null;
};

type OptionRow = {
  id: string;
  name: string;
  position: number;
  modifier_groups: { name: string } | null;
};

/**
 * Variantes de producto y opciones de personalización del restaurante con su
 * disponibilidad efectiva. Sin fila en `availability` = disponible (nace así).
 * Tres lecturas en paralelo; RLS limita todo al restaurante del usuario.
 */
export async function getAvailabilityItems(
  restaurantId: string
): Promise<AvailabilityItem[]> {
  const supabase = await createClient();

  const [variants, options, flags] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, name, position, products!inner(name, image_url, categories(name))")
      .eq("products.restaurant_id", restaurantId),
    supabase
      .from("modifier_options")
      .select("id, name, position, modifier_groups!inner(name)")
      .eq("modifier_groups.restaurant_id", restaurantId),
    supabase
      .from("availability")
      .select("item_type, item_id, available")
      .eq("restaurant_id", restaurantId),
  ]);

  if (variants.error) throw variants.error;
  if (options.error) throw options.error;
  if (flags.error) throw flags.error;

  const off = new Set(
    flags.data.filter((f) => !f.available).map((f) => `${f.item_type}:${f.item_id}`)
  );

  const variantItems: AvailabilityItem[] = (
    variants.data as unknown as VariantRow[]
  ).map((v) => {
    const key = `variant:${v.id}`;
    const product = v.products?.name ?? "Producto";
    return {
      key,
      itemType: "variant",
      itemId: v.id,
      title: v.name ? `${product} - ${v.name}` : product,
      subtitle: v.products?.categories?.name ?? null,
      imageUrl: v.products?.image_url ?? null,
      available: !off.has(key),
    };
  });

  const optionItems: AvailabilityItem[] = (
    options.data as unknown as OptionRow[]
  ).map((o) => {
    const key = `modifier_option:${o.id}`;
    return {
      key,
      itemType: "modifier_option",
      itemId: o.id,
      title: o.name,
      subtitle: o.modifier_groups?.name ?? null,
      imageUrl: null,
      available: !off.has(key),
    };
  });

  const byTitle = (a: AvailabilityItem, b: AvailabilityItem) =>
    a.title.localeCompare(b.title, "es");
  return [...variantItems.sort(byTitle), ...optionItems.sort(byTitle)];
}
