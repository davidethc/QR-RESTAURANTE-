import { createClient } from "@/lib/supabase/server";
import { getMyRestaurant, getRestaurantStaff } from "@/lib/queries/staff";
import { isManager } from "@/lib/permissions";
import { groupSecurityEvents, paginateSecurityGroups, securityDateBounds, type SecurityEvent, type SecurityFilters } from "@/lib/security-history";

const CHUNK = 500;
const MAX_EVENTS = 10_000;
const EVENT_COLUMNS = "id, restaurant_id, created_at, actor_user_id, action, event_type, entity_type, entity_id, group_key, amount, cash_movement_type, cash_movement_reason, cash_difference, reason" as const;

export async function getSecurityHistory(filters: SecurityFilters) {
  const session = await getMyRestaurant();
  if (!isManager(session.role)) throw new Error("No autorizado");
  const supabase = await createClient();
  const bounds = securityDateBounds(filters);
  const restaurantId = session.restaurant.id;
  const snapshotUntil = new Date(Math.min(Date.parse(bounds.until), Date.now())).toISOString();
  function filtered<Columns extends string>(columns: Columns) {
    let query = supabase.from("security_events").select(columns)
      .eq("restaurant_id", restaurantId).gte("created_at", bounds.from).lt("created_at", snapshotUntil);
    if (filters.action) query = query.eq("event_type", filters.action);
    if (filters.member) query = query.eq("actor_user_id", filters.member);
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  }
  // Índice ligero: una cuenta nunca se divide ni se repite en páginas distintas.
  const index: Pick<SecurityEvent, "id" | "group_key" | "created_at">[] = [];
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await filtered("id, group_key, created_at").range(offset, offset + CHUNK - 1);
    if (error) throw error;
    index.push(...((data ?? []) as unknown as typeof index));
    if (index.length > MAX_EVENTS) throw new Error("SECURITY_RANGE_TOO_LARGE");
    if ((data?.length ?? 0) < CHUNK) break;
  }
  const pagination = paginateSecurityGroups(index, filters.page);
  const events: SecurityEvent[] = [];
  if (pagination.keys.length) {
    for (let offset = 0; ; offset += CHUNK) {
      const { data, error } = await filtered(EVENT_COLUMNS).in("group_key", pagination.keys).range(offset, offset + CHUNK - 1);
      if (error) throw error;
      for (const row of data ?? []) events.push({ ...(row as unknown as SecurityEvent), metadata: null });
      if (events.length > MAX_EVENTS) throw new Error("SECURITY_RANGE_TOO_LARGE");
      if ((data?.length ?? 0) < CHUNK) break;
    }
  }
  const staff = await getRestaurantStaff(restaurantId);
  return {
    ...pagination, groups: groupSecurityEvents(events),
    members: staff.map((member) => ({ id: member.user_id, name: member.full_name || "Miembro sin nombre" })),
  };
}

export async function getSecurityOrder(orderId: string) {
  const session = await getMyRestaurant();
  if (!isManager(session.role)) throw new Error("No autorizado");
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders")
    .select("id, order_number, status, created_at, total, rejection_reason, notes, order_items(id, product_name, quantity, subtotal)")
    .eq("restaurant_id", session.restaurant.id).eq("id", orderId).maybeSingle();
  if (error) throw error;
  return data;
}
