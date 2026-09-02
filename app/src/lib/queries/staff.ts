import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, CallStatus } from "@/config/constants";
import type {
  MyRestaurant,
  StaffOrder,
  StaffWaiterCall,
  DashboardSummary,
  TableStatusRow,
  AdminMenu,
  StaffMember,
} from "@/types/staff";

/**
 * Consultas del panel. Cada una es una sola llamada a la base:
 * la pantalla recibe todo lo que necesita pintar, sin peticiones en cascada.
 */

export async function getMyRestaurant(): Promise<MyRestaurant> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_restaurant");

  if (error) throw error;
  return data as unknown as MyRestaurant;
}

export async function getStaffOrders(
  restaurantId: string,
  statuses?: OrderStatus[],
  limit = 50
): Promise<StaffOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_staff_orders", {
    p_restaurant_id: restaurantId,
    p_statuses: statuses,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as unknown as StaffOrder[];
}

export async function getWaiterCalls(
  restaurantId: string,
  statuses?: CallStatus[]
): Promise<StaffWaiterCall[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_waiter_calls", {
    p_restaurant_id: restaurantId,
    p_statuses: statuses,
  });

  if (error) throw error;
  return (data ?? []) as unknown as StaffWaiterCall[];
}

export async function getDashboardSummary(
  restaurantId: string
): Promise<DashboardSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_summary", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return data as unknown as DashboardSummary;
}

export async function getTablesStatus(
  restaurantId: string
): Promise<TableStatusRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_tables_status", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return (data ?? []) as unknown as TableStatusRow[];
}

export async function getAdminMenu(restaurantId: string): Promise<AdminMenu> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_menu", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return data as unknown as AdminMenu;
}

export async function getStaffMembers(
  restaurantId: string
): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_staff_members", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return (data ?? []) as unknown as StaffMember[];
}

/** Pedidos que cocina debe ver: nunca los pendientes de aprobación. */
export async function getKitchenOrders(
  restaurantId: string
): Promise<StaffOrder[]> {
  return getStaffOrders(restaurantId, ["ACCEPTED", "PREPARING", "READY"]);
}
