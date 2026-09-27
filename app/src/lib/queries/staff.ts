import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, CallStatus } from "@/config/constants";
import type {
  MyRestaurant,
  StaffOrder,
  StaffWaiterCall,
  DashboardSummary,
  TableStatusRow,
  AdminMenu,
  RestaurantSettings,
  TableForOrder,
  TopProduct,
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

export async function getRestaurantSettings(
  restaurantId: string
): Promise<RestaurantSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurants")
    // billing_enabled y max_waiter_discount_pct: columnas del módulo de
    // cobro (M5). No hace falta RPC nueva — restaurants_select_members ya
    // deja leer cualquier columna de su restaurante a todo miembro.
    .select(
      "id, name, slug, description, logo_url, phone, address, billing_enabled, max_waiter_discount_pct"
    )
    .eq("id", restaurantId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mapa mesa -> sesión de mesa viva (ACTIVE o EXPIRED, la más reciente),
 * para el módulo de cobro. `open_bill` y `get_session_bill` necesitan el
 * id de la sesión, pero ni `get_tables_status` ni `get_waiter_calls` lo
 * devuelven (solo agregan `bill_id`/`bill_status`/`bill_balance` cuando ya
 * existe una cuenta abierta). Select directo en vez de una RPC nueva:
 * `table_sessions_select_staff` ya deja leer a cualquier miembro.
 */
export async function getActiveTableSessionsMap(
  restaurantId: string
): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("table_sessions")
    .select("id, table_id, started_at")
    .eq("restaurant_id", restaurantId)
    .in("status", ["ACTIVE", "EXPIRED"])
    .order("started_at", { ascending: false });

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    // Ordenado por más reciente primero: la primera vez que se ve una
    // mesa es su sesión viva actual.
    if (!(row.table_id in map)) map[row.table_id] = row.id;
  }
  return map;
}

/**
 * La mesa que el mesero abrió para tomarle el pedido.
 *
 * Select directo en vez de RPC nuevo: la política `tables_select_members` ya
 * limita la lectura a los miembros del restaurante. Aun así, quien llame debe
 * comprobar que `restaurant_id` coincide con el suyo antes de usarla.
 */
export async function getTableForOrder(
  tableId: string
): Promise<TableForOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .select("id, number, name, restaurant_id, status")
    .eq("id", tableId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Los platos más vendidos del último mes.
 *
 * Con 50 productos en la carta, encontrar el capuchino cuesta teclear; acá
 * arriba es un toque. Si el restaurante todavía no tiene historial, devuelve
 * lista vacía y la sección simplemente no se muestra.
 */
export async function getTopProducts(
  restaurantId: string,
  limit = 8
): Promise<TopProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_top_products", {
    p_restaurant_id: restaurantId,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as unknown as TopProduct[];
}
