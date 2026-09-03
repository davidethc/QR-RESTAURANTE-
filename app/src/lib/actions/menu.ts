"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, productSchema } from "@/lib/validations/menu";
import type { ActionResult } from "@/types/actions";

/**
 * Las políticas RLS de `categories`/`products` ya restringen escritura a
 * OWNER/ADMIN (ver `products_update_admin` etc.) — estas actions no
 * repiten ese chequeo, solo validan forma con Zod antes de escribir.
 * `updateTag` refresca la carta pública cacheada al instante (Next 16:
 * "leer lo que uno mismo acaba de escribir" — ver AGENTS.md); sin esto
 * el cliente vería el producto viejo hasta 5 minutos.
 */

export async function createCategory(
  restaurantId: string,
  slug: string,
  input: unknown
): Promise<ActionResult<string>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({
      restaurant_id: restaurantId,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: data.id };
}

export async function updateCategory(
  categoryId: string,
  slug: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", categoryId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

export async function deleteCategory(
  categoryId: string,
  slug: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

export async function createProduct(
  restaurantId: string,
  slug: string,
  input: unknown
): Promise<ActionResult<string>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      restaurant_id: restaurantId,
      category_id: parsed.data.category_id || null,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price: parsed.data.price,
      available: parsed.data.available,
      featured: parsed.data.featured,
      paired_drink_id: parsed.data.paired_drink_id || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: data.id };
}

export async function updateProduct(
  productId: string,
  slug: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      category_id: parsed.data.category_id || null,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price: parsed.data.price,
      available: parsed.data.available,
      featured: parsed.data.featured,
      paired_drink_id: parsed.data.paired_drink_id || null,
    })
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

export async function deleteProduct(
  productId: string,
  slug: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

export async function toggleProductAvailable(
  productId: string,
  slug: string,
  available: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ available })
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

/**
 * Reordenar arrastrando: el cliente manda la lista completa de ids en
 * su nuevo orden, y se reescribe `position` de todos de una vez. Con
 * pocas decenas de categorías/productos por restaurante, N updates en
 * paralelo es más simple que armar un UPDATE...FROM con un CASE — y
 * no hace falta un RPC nuevo, las políticas RLS ya cubren esto.
 *
 * `.select('id')` + revisar cuántas filas volvieron es a propósito:
 * cuando RLS bloquea un UPDATE no lanza error, solo actualiza 0 filas
 * en silencio — sin esto, un intento sin permiso (o un id que ya no
 * existe) se reportaría como éxito aunque no haya cambiado nada.
 */
export async function reorderCategories(
  slug: string,
  orderedIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("categories").update({ position }).eq("id", id).select("id")
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  if (results.some((r) => (r.data?.length ?? 0) === 0)) {
    return { ok: false, error: "No autorizado para reordenar categorías." };
  }

  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

export async function reorderProducts(
  slug: string,
  orderedIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("products").update({ position }).eq("id", id).select("id")
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  if (results.some((r) => (r.data?.length ?? 0) === 0)) {
    return { ok: false, error: "No autorizado para reordenar productos." };
  }

  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadProductImage(
  restaurantId: string,
  productId: string,
  slug: string,
  formData: FormData
): Promise<ActionResult<string>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Formato no permitido. Usa JPEG, PNG o WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "La imagen no puede pesar más de 5 MB." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${restaurantId}/${productId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { ok: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("products")
    .update({ image_url: publicUrl })
    .eq("id", productId);

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/menu");
  updateTag(`menu-${slug}`);
  return { ok: true, data: publicUrl };
}
