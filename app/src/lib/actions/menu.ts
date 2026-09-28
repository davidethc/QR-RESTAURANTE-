"use server";

import { revalidatePath } from "next/cache";
import { refreshPublicMenuTag } from "@/lib/public-menu-tag";
import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
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

/**
 * RLS no lanza error cuando bloquea un UPDATE/DELETE: simplemente afecta 0
 * filas. Por eso cada escritura pide `.select("id")` y, si no volvió nada,
 * el cambio no ocurrió (sin permiso o el registro ya no existe) y no se
 * reporta como éxito.
 */
function notFoundOrForbidden(what: string): { ok: false; error: string } {
  return {
    ok: false,
    error: `No se pudo modificar ${what}: ya no existe o no tienes permiso.`,
  };
}

export async function createCategory(
  restaurantId: string,
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

  if (error) return dbFailure(error, "createCategory");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: data.id };
}

export async function updateCategory(
  categoryId: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", categoryId)
    .select("id");

  if (error) return dbFailure(error, "updateCategory");
  if (!data?.length) return notFoundOrForbidden("la categoría");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: undefined };
}

export async function deleteCategory(
  categoryId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .select("id");

  if (error) return dbFailure(error, "deleteCategory");
  if (!data?.length) return notFoundOrForbidden("la categoría");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: undefined };
}

export async function createProduct(
  restaurantId: string,
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

  if (error) return dbFailure(error, "createProduct");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: data.id };
}

export async function updateProduct(
  productId: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
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
    .eq("id", productId)
    .select("id");

  if (error) return dbFailure(error, "updateProduct");
  if (!data?.length) return notFoundOrForbidden("el producto");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: undefined };
}

export async function deleteProduct(
  productId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .select("id");

  if (error) return dbFailure(error, "deleteProduct");
  if (!data?.length) return notFoundOrForbidden("el producto");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: undefined };
}

export async function toggleProductAvailable(
  productId: string,
  available: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ available })
    .eq("id", productId)
    .select("id");

  if (error) return dbFailure(error, "toggleProductAvailable");
  if (!data?.length) return notFoundOrForbidden("el producto");
  revalidatePath("/menu");
  await refreshPublicMenuTag();
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
  orderedIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("categories").update({ position }).eq("id", id).select("id")
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return dbFailure(failed.error, "reorderCategories");
  if (results.some((r) => (r.data?.length ?? 0) === 0)) {
    return { ok: false, error: "No autorizado para reordenar categorías." };
  }

  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: undefined };
}

export async function reorderProducts(
  orderedIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("products").update({ position }).eq("id", id).select("id")
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return dbFailure(failed.error, "reorderProducts");
  if (results.some((r) => (r.data?.length ?? 0) === 0)) {
    return { ok: false, error: "No autorizado para reordenar productos." };
  }

  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: undefined };
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadProductImage(
  restaurantId: string,
  productId: string,
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

  if (uploadError) return dbFailure(uploadError, "uploadProductImage");

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path);

  const { data: updated, error: updateError } = await supabase
    .from("products")
    .update({ image_url: publicUrl })
    .eq("id", productId)
    .select("id");

  if (updateError) return dbFailure(updateError, "uploadProductImage");
  if (!updated?.length) return notFoundOrForbidden("el producto");

  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: publicUrl };
}
