import { createClient } from "@/lib/supabase/server";
import type { KitchenTicketsPayload } from "@/lib/kds";

export async function getKitchenTickets(
  restaurantId: string,
  status: "pending" | "completed" = "pending",
  limit = 50,
  offset = 0
): Promise<KitchenTicketsPayload> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_kitchen_tickets", {
    p_restaurant_id: restaurantId,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data as unknown as KitchenTicketsPayload;
}
