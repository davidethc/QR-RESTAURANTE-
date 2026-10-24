import { createClient } from "@/lib/supabase/server";
import type { Promotion } from "@/types/promotions";

/**
 * Admin list of promotions (RLS: active members can SELECT; writes only by
 * RPC). The "active today" status is computed on screen with the restaurant's
 * local date, not persisted.
 */
export async function listPromotions(restaurantId: string): Promise<Promotion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as unknown as Promotion),
    value: row.value == null ? null : Number(row.value),
  }));
}
