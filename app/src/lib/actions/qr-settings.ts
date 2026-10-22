"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import type { ActionResult } from "@/types/actions";

/** "Pedidos QR requieren aprobación" (solo dueño o administrador; la base lo exige). */
export async function setQrOrdersRequireApproval(
  restaurantId: string,
  requireApproval: boolean
): Promise<ActionResult> {
  if (typeof requireApproval !== "boolean") {
    return { ok: false, error: "Valor inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_qr_settings", {
    p_restaurant_id: restaurantId,
    p_require_approval: requireApproval,
  });
  if (error) return dbFailure(error, "setQrOrdersRequireApproval");
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}
