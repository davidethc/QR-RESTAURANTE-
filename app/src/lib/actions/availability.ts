"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import { setItemAvailabilitySchema } from "@/lib/validations/menu";
import type { ActionResult } from "@/types/actions";

/**
 * Marca una variante u opción como disponible/agotada. La validación de rol
 * (OWNER, ADMIN, WAITER, KITCHEN, CASHIER del mismo restaurante) y de
 * pertenencia del ítem la hace la RPC `set_item_availability` (42501).
 */
export async function setItemAvailability(input: unknown): Promise<ActionResult> {
  const parsed = setItemAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_item_availability", {
    p_item_type: parsed.data.itemType,
    p_item_id: parsed.data.itemId,
    p_available: parsed.data.available,
  });

  if (error) {
    if (error.code === "42501") {
      return {
        ok: false,
        error: "No puedes cambiar la disponibilidad de este ítem.",
      };
    }
    return dbFailure(error, "setItemAvailability");
  }

  revalidatePath("/menu");
  return { ok: true, data: undefined };
}
