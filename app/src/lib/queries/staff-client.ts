"use client";

import { createClient } from "@/lib/supabase/client";
import { parseStaffCounters, type StaffCounters } from "@/lib/staff-counters";
import type { KitchenTicketsPayload } from "@/lib/kds";
import type { KitchenTicketsQuery } from "@/lib/validations/kds";
import type { OrderStatus, CallStatus } from "@/config/constants";
import type { StaffOrder, StaffWaiterCall } from "@/types/staff";

/**
 * Lecturas del panel desde el NAVEGADOR, directo a Supabase.
 *
 * Antes cada refetch por evento de Realtime pasaba por una Server Action:
 * una ida al servidor de Next (con el proxy, getClaims y la lectura de
 * miembro incluidas) para acabar llamando al mismo RPC. Estos RPC son
 * SECURITY DEFINER, validan `auth.uid()`/membresía por dentro y están
 * concedidos a `authenticated` (ver supabase/migrations: 030_staff_queries,
 * m05_kds, m09_realtime), así que el cliente del navegador, con el JWT del
 * propio usuario, recibe exactamente lo mismo que recibía el servidor.
 * `orders.source` tiene `grant select (source)` a `authenticated`
 * (m11_qr_client). Las Server Actions quedan solo para mutaciones.
 */

/** `orders.source` no cambia nunca: se consulta una vez por pedido. */
const sourceCache = new Map<string, string | null>();

export async function readStaffOrders(
  restaurantId: string,
  statuses?: OrderStatus[],
  limit = 50
): Promise<StaffOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_staff_orders", {
    p_restaurant_id: restaurantId,
    p_statuses: statuses,
    p_limit: limit,
  });
  if (error) throw error;
  const orders = (data ?? []) as unknown as StaffOrder[];

  // `get_staff_orders` no devuelve el origen: solo se pide el de los
  // pedidos que aún no se conocen (normalmente uno por evento de pedido
  // nuevo, ninguno en un cambio de estado).
  const missing = orders.filter((o) => !sourceCache.has(o.id)).map((o) => o.id);
  if (missing.length > 0) {
    const { data: sources } = await supabase
      .from("orders")
      .select("id, source")
      .in("id", missing);
    for (const s of sources ?? []) sourceCache.set(s.id, s.source);
    for (const id of missing) if (!sourceCache.has(id)) sourceCache.set(id, null);
  }
  for (const o of orders) o.source = sourceCache.get(o.id) ?? null;
  return orders;
}

export async function readWaiterCalls(
  restaurantId: string,
  statuses?: CallStatus[]
): Promise<StaffWaiterCall[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_waiter_calls", {
    p_restaurant_id: restaurantId,
    p_statuses: statuses,
  });
  if (error) throw error;
  return (data ?? []) as unknown as StaffWaiterCall[];
}

export async function readStaffCounters(restaurantId: string): Promise<StaffCounters> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_staff_counters", {
    p_restaurant_id: restaurantId,
  });
  if (error) throw error;
  return parseStaffCounters(data);
}

export async function readKitchenTickets(
  query: KitchenTicketsQuery
): Promise<KitchenTicketsPayload> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_kitchen_tickets", {
    p_restaurant_id: query.restaurantId,
    p_status: query.status ?? "pending",
    p_limit: query.limit ?? 50,
    p_offset: query.offset ?? 0,
  });
  if (error) throw error;
  return data as unknown as KitchenTicketsPayload;
}
