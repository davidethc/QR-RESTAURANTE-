"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import { PRINT_TEXT_MAX } from "@/lib/printing";
import type { ActionResult } from "@/types/actions";
import type { PrintingSettings } from "@/types/printing";

const fontSize = z.enum(["small", "normal", "large"]);

const saveSchema = z.object({
  restaurantId: z.string().uuid("Restaurante inválido"),
  customer_ticket_font_size: fontSize,
  customer_ticket_header: z.string().trim().max(PRINT_TEXT_MAX, `Máximo ${PRINT_TEXT_MAX} caracteres`),
  customer_ticket_footer: z.string().trim().max(PRINT_TEXT_MAX, `Máximo ${PRINT_TEXT_MAX} caracteres`),
  kitchen_ticket_font_size: fontSize,
});

export type SavePrintingInput = z.input<typeof saveSchema>;

/** Settings + ticket header data (name, logo, address) for the current restaurant. */
export async function getPrintingSettings(restaurantId: string): Promise<PrintingSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_printing_settings", { p_restaurant_id: restaurantId });
  if (error) throw error;
  return data as unknown as PrintingSettings;
}

export async function savePrintingSettings(input: SavePrintingInput): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const { restaurantId, ...data } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_printing_settings", { p_restaurant_id: restaurantId, p_data: data });
  if (error) return dbFailure(error, "savePrintingSettings");
  revalidatePath("/settings/printing");
  revalidatePath("/cash/ticket");
  revalidatePath("/kitchen/print");
  return { ok: true, data: undefined };
}
