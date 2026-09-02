"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { restaurantSettingsSchema } from "@/lib/validations/restaurant";
import type { ActionResult } from "@/types/actions";

export async function updateRestaurantSettings(
  restaurantId: string,
  slug: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = restaurantSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
    })
    .eq("id", restaurantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  updateTag(`menu-${slug}`);
  return { ok: true, data: undefined };
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * No hay bucket propio para logos — se reutiliza `product-images`. La
 * política de Storage solo exige que el primer segmento de la ruta sea
 * el `restaurant_id` del que sube; no le importa si es un logo o un
 * plato, así que esto es seguro sin crear un bucket nuevo.
 */
export async function uploadRestaurantLogo(
  restaurantId: string,
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
  const path = `${restaurantId}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { ok: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("restaurants")
    .update({ logo_url: publicUrl })
    .eq("id", restaurantId);

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/settings");
  updateTag(`menu-${slug}`);
  return { ok: true, data: publicUrl };
}
