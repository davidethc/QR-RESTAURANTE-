import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import type { HomeDashboard } from "@/types/home-dashboard";

/** Cards of "Hoy" for a business-day range. Only Owner and Admin (the RPC checks it again). */
export async function getHomeDashboard(restaurantId: string, from: string, to: string): Promise<HomeDashboard> {
  const supabase = await createClient();
  const { data, error } = await callUntypedRpc<HomeDashboard>(supabase, "get_home_dashboard", {
    p_restaurant_id: restaurantId,
    p_from: from,
    p_to: to,
  });
  if (error || !data) throw error ?? new Error("Sin datos del panel");
  return data;
}
