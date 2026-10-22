"use server";

import { revalidatePath } from "next/cache";
import { refreshPublicMenuTag } from "@/lib/public-menu-tag";
import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import { categorySchema, productSchema, catalogIdSchema, productVariantsSchema,
  modifierGroupSchema, modifierOptionSchema, productModifierGroupSchema } from "@/lib/validations/menu";
import type { ProductInput, ProductVariantInput, ModifierGroupInput } from "@/lib/validations/menu";
import type { ActionResult } from "@/types/actions";

/**
 * Las políticas RLS de `categories`/`products` ya restringen escritura a
 * OWNER/ADMIN (ver `products_update_admin` etc.). Las acciones nuevas también
 * comprueban la membresía activa y la pertenencia de los registros.
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

  if (parsed.data.variants) {
    const supabase = await createClient();
    return saveVariantProduct(supabase, restaurantId, parsed.data, parsed.data.variants);
  }
  const access = await catalogAccess(restaurantId);
  if (!access.ok) return access;
  const supabase = access.supabase;
  const relations = await checkProductRelations(supabase, restaurantId, parsed.data);
  if (!relations.ok) return relations;
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

  const access = await productAccess(productId);
  if (!access.ok) return access;
  const supabase = access.supabase;
  if (parsed.data.variants) {
    const saved = await saveVariantProduct(supabase, access.product.restaurant_id, parsed.data, parsed.data.variants, productId);
    return saved.ok ? { ok: true, data: undefined } : saved;
  }
  const relations = await checkProductRelations(supabase, access.product.restaurant_id, parsed.data);
  if (!relations.ok) return relations;
  const { data, error } = await supabase
    .from("products")
    .update({
      category_id: parsed.data.category_id || null,
      name: parsed.data.name,
      description: parsed.data.description || null,
      ...(access.product.product_variants.length <= 1 ? { price: parsed.data.price } : {}),
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

  if (updateError || !updated?.length) {
    await supabase.storage.from("product-images").remove([path]);
    if (updateError) return dbFailure(updateError, "uploadProductImage");
    return notFoundOrForbidden("el producto");
  }

  revalidatePath("/menu");
  await refreshPublicMenuTag();
  return { ok: true, data: publicUrl };
}


type CatalogClient = Awaited<ReturnType<typeof createClient>>;

async function refreshCatalog() {
  revalidatePath("/menu");
  await refreshPublicMenuTag();
}

async function saveVariantProduct(
  supabase: CatalogClient,
  restaurantId: string,
  product: ProductInput,
  variants: ProductVariantInput[],
  productId?: string,
): Promise<ActionResult<string>> {
  const { data, error } = await supabase.rpc("save_product_with_variants", {
    p_restaurant_id: restaurantId,
    p_name: product.name,
    p_variants: variants.map(({ id, name, price }) => ({ ...(id ? { id } : {}), name, price })),
    p_product_id: productId ?? null,
    p_category_id: product.category_id || null,
    p_description: product.description || null,
    p_paired_drink_id: product.paired_drink_id || null,
    p_available: product.available,
    p_featured: product.featured,
  });
  if (error) return dbFailure(error, "save_product_with_variants");
  if (!data) return notFoundOrForbidden("el producto");
  await refreshCatalog();
  return { ok: true, data };
}

async function catalogAccess(restaurantId: string, client?: CatalogClient) {
  if (!catalogIdSchema.safeParse(restaurantId).success) return { ok: false, error: "Restaurante inválido." } as const;
  const supabase = client ?? await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Inicia sesión para administrar el catálogo." } as const;
  const { data, error } = await supabase.from("restaurant_members").select("role")
    .eq("restaurant_id", restaurantId).eq("user_id", user.id).eq("status", "ACTIVE").maybeSingle();
  if (error) return dbFailure(error, "catalogAccess");
  if (!data || !["OWNER", "ADMIN"].includes(data.role)) {
    return { ok: false, error: "Solo el dueño o administrador puede modificar el catálogo." } as const;
  }
  return { ok: true, supabase } as const;
}

async function productAccess(productId: string) {
  if (!catalogIdSchema.safeParse(productId).success) return { ok: false, error: "Producto inválido." } as const;
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("products")
    .select("id, restaurant_id, price, product_variants(*)").eq("id", productId).maybeSingle();
  if (error) return dbFailure(error, "productAccess");
  if (!product) return notFoundOrForbidden("el producto");
  const access = await catalogAccess(product.restaurant_id, supabase);
  if (!access.ok) return access;
  return { ok: true, supabase, product } as const;
}

async function groupAccess(groupId: string) {
  if (!catalogIdSchema.safeParse(groupId).success) return { ok: false, error: "Personalización inválida." } as const;
  const supabase = await createClient();
  const { data: group, error } = await supabase.from("modifier_groups")
    .select("*, modifier_options(*)").eq("id", groupId).maybeSingle();
  if (error) return dbFailure(error, "groupAccess");
  if (!group) return notFoundOrForbidden("la personalización");
  const access = await catalogAccess(group.restaurant_id, supabase);
  if (!access.ok) return access;
  return { ok: true, supabase, group } as const;
}

async function checkProductRelations(supabase: CatalogClient, restaurantId: string, input: { category_id?: string; paired_drink_id?: string }): Promise<ActionResult> {
  if (input.category_id) {
    const { data, error } = await supabase.from("categories").select("id").eq("id", input.category_id).eq("restaurant_id", restaurantId).maybeSingle();
    if (error) return dbFailure(error, "checkProductCategory");
    if (!data) return notFoundOrForbidden("la categoría");
  }
  if (input.paired_drink_id) {
    const { data, error } = await supabase.from("products").select("id").eq("id", input.paired_drink_id).eq("restaurant_id", restaurantId).maybeSingle();
    if (error) return dbFailure(error, "checkPairedDrink");
    if (!data) return notFoundOrForbidden("la bebida");
  }
  return { ok: true, data: undefined };
}

export async function saveProductVariants(productId: string, input: unknown): Promise<ActionResult> {
  const parsed = productVariantsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!catalogIdSchema.safeParse(productId).success) return { ok: false, error: "Producto inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_product_variants", {
    p_product_id: productId,
    p_variants: parsed.data.map(({ id, name, price }) => ({ ...(id ? { id } : {}), name, price })),
  });
  if (error) return dbFailure(error, "save_product_variants");
  await refreshCatalog();
  return { ok: true, data: undefined };
}

export async function getCatalog(restaurantId: string) {
  const access = await catalogAccess(restaurantId);
  if (!access.ok) return access;
  const [categories, products] = await Promise.all([
    access.supabase.from("categories").select("*").eq("restaurant_id", restaurantId).order("position"),
    access.supabase.from("products").select("*, product_variants(*), product_modifier_groups(*)").eq("restaurant_id", restaurantId).order("position"),
  ]);
  if (categories.error) return dbFailure(categories.error, "getCatalog.categories");
  if (products.error) return dbFailure(products.error, "getCatalog.products");
  return { ok: true, data: { categories: categories.data, products: products.data } } as const;
}

export async function getModifierGroups(restaurantId: string) {
  const access = await catalogAccess(restaurantId);
  if (!access.ok) return access;
  const { data, error } = await access.supabase.from("modifier_groups")
    .select("*, modifier_options(*), product_modifier_groups(product_id)")
    .eq("restaurant_id", restaurantId).order("name");
  if (error) return dbFailure(error, "getModifierGroups");
  return { ok: true, data: data.map((group) => ({ ...group, usage_count: group.product_modifier_groups.length })) } as const;
}

async function writeGroupOptions(supabase: CatalogClient, groupId: string, options: ModifierGroupInput["options"], beforeDelete?: () => Promise<ActionResult>): Promise<ActionResult> {
  const { data: existing, error: readError } = await supabase.from("modifier_options").select("id").eq("group_id", groupId);
  if (readError) return dbFailure(readError, "writeGroupOptions.read");
  if (options.some((option) => option.id && !existing.some((row) => row.id === option.id))) return notFoundOrForbidden("la opción");
  const rows = options.map((option, position) => ({ id: option.id ?? crypto.randomUUID(), group_id: groupId, name: option.name, price: option.price, position }));
  const { data: saved, error } = await supabase.from("modifier_options").upsert(rows).select("id");
  if (error) return dbFailure(error, "writeGroupOptions.upsert");
  if (saved?.length !== rows.length) return notFoundOrForbidden("las opciones");
  if (beforeDelete) {
    const result = await beforeDelete();
    if (!result.ok) { await refreshCatalog(); return result; }
  }
  const keep = new Set(rows.map((row) => row.id));
  const remove = existing.filter((row) => !keep.has(row.id)).map((row) => row.id);
  if (remove.length) {
    const { data, error: deleteError } = await supabase.from("modifier_options").delete().eq("group_id", groupId).in("id", remove).select("id");
    if (deleteError) { await refreshCatalog(); return dbFailure(deleteError, "writeGroupOptions.delete"); }
    if (data?.length !== remove.length) { await refreshCatalog(); return notFoundOrForbidden("las opciones anteriores"); }
  }
  return { ok: true, data: undefined };
}

export async function createModifierGroup(restaurantId: string, input: unknown): Promise<ActionResult<string>> {
  const parsed = modifierGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.options.some((option) => option.id)) return { ok: false, error: "No envíes identificadores de opciones al crear una personalización." };
  const access = await catalogAccess(restaurantId);
  if (!access.ok) return access;
  const { options, ...fields } = parsed.data;
  const { data, error } = await access.supabase.from("modifier_groups")
    .insert({ ...fields, internal_label: fields.internal_label || null, restaurant_id: restaurantId }).select("id").single();
  if (error) return dbFailure(error, "createModifierGroup");
  const written = await writeGroupOptions(access.supabase, data.id, options);
  if (!written.ok) {
    const { data: removed, error: cleanupError } = await access.supabase.from("modifier_groups").delete().eq("id", data.id).select("id");
    if (cleanupError || !removed?.length) {
      await refreshCatalog();
      return { ok: false, error: "No se completó el alta ni se pudo retirar la personalización incompleta. Recarga el catálogo y revísala antes de reintentar." };
    }
    return written;
  }
  await refreshCatalog();
  return { ok: true, data: data.id };
}

export async function updateModifierGroup(groupId: string, input: unknown): Promise<ActionResult> {
  const parsed = modifierGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await groupAccess(groupId);
  if (!access.ok) return access;
  const { options, ...fields } = parsed.data;
  const written = await writeGroupOptions(access.supabase, groupId, options, async () => {
    const { data, error } = await access.supabase.from("modifier_groups")
      .update({ ...fields, internal_label: fields.internal_label || null }).eq("id", groupId).select("id");
    if (error) return dbFailure(error, "updateModifierGroup");
    if (!data?.length) return notFoundOrForbidden("la personalización");
    return { ok: true, data: undefined };
  });
  if (!written.ok) return written;
  await refreshCatalog();
  return { ok: true, data: undefined };
}

export async function getModifierGroupUsage(groupId: string): Promise<ActionResult<number>> {
  const access = await groupAccess(groupId);
  if (!access.ok) return access;
  const { count, error } = await access.supabase.from("product_modifier_groups")
    .select("id", { count: "exact", head: true }).eq("group_id", groupId);
  if (error) return dbFailure(error, "getModifierGroupUsage");
  return { ok: true, data: count ?? 0 };
}

export async function deleteModifierGroup(groupId: string, confirmedUsageCount?: number): Promise<ActionResult> {
  const access = await groupAccess(groupId);
  if (!access.ok) return access;
  const { count, error: countError } = await access.supabase.from("product_modifier_groups")
    .select("id", { count: "exact", head: true }).eq("group_id", groupId);
  if (countError) return dbFailure(countError, "deleteModifierGroup.usage");
  const usage = count ?? 0;
  if (usage > 0 && confirmedUsageCount !== usage) {
    return { ok: false, error: `Esta personalización se usa en ${usage} productos. Confirma el borrado indicando esa cantidad.` };
  }
  const { data, error } = await access.supabase.from("modifier_groups").delete().eq("id", groupId).select("id");
  if (error) return dbFailure(error, "deleteModifierGroup");
  if (!data?.length) return notFoundOrForbidden("la personalización");
  await refreshCatalog();
  return { ok: true, data: undefined };
}

export async function createModifierOption(groupId: string, input: unknown): Promise<ActionResult<string>> {
  const parsed = modifierOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await groupAccess(groupId);
  if (!access.ok) return access;
  const checked = modifierGroupSchema.safeParse({ ...access.group, options: [...access.group.modifier_options, parsed.data] });
  if (!checked.success) return { ok: false, error: checked.error.issues[0].message };
  if (parsed.data.id) return { ok: false, error: "No envíes un identificador al crear una opción." };
  const fields = { name: parsed.data.name, price: parsed.data.price, position: parsed.data.position };
  const { data, error } = await access.supabase.from("modifier_options").insert({ ...fields, group_id: groupId }).select("id").single();
  if (error) return dbFailure(error, "createModifierOption");
  await refreshCatalog();
  return { ok: true, data: data.id };
}

export async function updateModifierOption(groupId: string, optionId: string, input: unknown): Promise<ActionResult> {
  const parsed = modifierOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await groupAccess(groupId);
  if (!access.ok) return access;
  if (!access.group.modifier_options.some((option) => option.id === optionId)) return notFoundOrForbidden("la opción");
  const checked = modifierGroupSchema.safeParse({ ...access.group, options: access.group.modifier_options.map((option) => option.id === optionId ? { ...parsed.data, id: optionId } : option) });
  if (!checked.success) return { ok: false, error: checked.error.issues[0].message };
  const fields = { name: parsed.data.name, price: parsed.data.price, position: parsed.data.position };
  const { data, error } = await access.supabase.from("modifier_options").update(fields).eq("id", optionId).eq("group_id", groupId).select("id");
  if (error) return dbFailure(error, "updateModifierOption");
  if (!data?.length) return notFoundOrForbidden("la opción");
  await refreshCatalog();
  return { ok: true, data: undefined };
}

export async function deleteModifierOption(groupId: string, optionId: string): Promise<ActionResult> {
  const access = await groupAccess(groupId);
  if (!access.ok) return access;
  if (!access.group.modifier_options.some((option) => option.id === optionId)) return notFoundOrForbidden("la opción");
  const checked = modifierGroupSchema.safeParse({ ...access.group, options: access.group.modifier_options.filter((option) => option.id !== optionId) });
  if (!checked.success) return { ok: false, error: checked.error.issues[0].message };
  const { data, error } = await access.supabase.from("modifier_options").delete().eq("id", optionId).eq("group_id", groupId).select("id");
  if (error) return dbFailure(error, "deleteModifierOption");
  if (!data?.length) return notFoundOrForbidden("la opción");
  await refreshCatalog();
  return { ok: true, data: undefined };
}

export async function linkProductModifierGroup(input: unknown): Promise<ActionResult<string>> {
  const parsed = productModifierGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await productAccess(parsed.data.product_id);
  if (!access.ok) return access;
  const { data: group, error: readError } = await access.supabase.from("modifier_groups").select("*, modifier_options(*)").eq("id", parsed.data.group_id).maybeSingle();
  if (readError) return dbFailure(readError, "linkProductModifierGroup.read");
  if (!group || group.restaurant_id !== access.product.restaurant_id) return { ok: false, error: "El producto y la personalización deben pertenecer al mismo restaurante." };
  const checked = modifierGroupSchema.safeParse({ ...group, options: group.modifier_options });
  if (!checked.success) return { ok: false, error: checked.error.issues[0].message };
  const { data, error } = await access.supabase.from("product_modifier_groups")
    .upsert(parsed.data, { onConflict: "product_id,group_id" }).select("id").single();
  if (error) return dbFailure(error, "linkProductModifierGroup");
  await refreshCatalog();
  return { ok: true, data: data.id };
}

export async function unlinkProductModifierGroup(productId: string, groupId: string): Promise<ActionResult> {
  const parsed = productModifierGroupSchema.safeParse({ product_id: productId, group_id: groupId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await productAccess(productId);
  if (!access.ok) return access;
  const { data, error } = await access.supabase.from("product_modifier_groups").delete()
    .eq("product_id", productId).eq("group_id", groupId).select("id");
  if (error) return dbFailure(error, "unlinkProductModifierGroup");
  if (!data?.length) return notFoundOrForbidden("el vínculo");
  await refreshCatalog();
  return { ok: true, data: undefined };
}
