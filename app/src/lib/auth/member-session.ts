import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { MyRestaurant } from "@/types/staff";

/** El RPC legacy elige la sucursal; los permisos se leen de ese mismo miembro activo. */
export async function readMemberSession(supabase: SupabaseClient<Database>): Promise<MyRestaurant> {
  const { data, error } = await supabase.rpc("get_my_restaurant");
  if (error) throw error;
  const session = data as unknown as MyRestaurant;
  const { data: member, error: memberError } = await supabase
    .from("restaurant_members")
    .select("roles, cash_register_ids")
    .eq("restaurant_id", session.restaurant.id)
    .eq("user_id", session.user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (memberError) {
    // Compatibilidad durante expand: solo una columna ausente permite volver a role.
    if (memberError.code === "42703" || memberError.code === "PGRST204") return session;
    throw memberError;
  }
  if (!member) throw new Error("Tu cuenta no está asignada a ningún restaurante");
  return { ...session, roles: member.roles, cash_register_ids: member.cash_register_ids };
}
