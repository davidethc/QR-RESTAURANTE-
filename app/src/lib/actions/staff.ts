"use server";

import { getStaffOrders, getWaiterCalls } from "@/lib/queries/staff";
import type { OrderStatus, CallStatus } from "@/config/constants";

/**
 * `queries/staff.ts` está pensado para Server Components (usa cookies()
 * directamente). Estas dos envolturas existen solo porque el panel del
 * mesero necesita volver a pedir los datos desde el cliente cuando
 * Realtime avisa un cambio — son lecturas, no mutaciones, pero deben
 * vivir en un archivo "use server" para poder llamarse así.
 */
export async function fetchStaffOrders(
  restaurantId: string,
  statuses?: OrderStatus[]
) {
  return getStaffOrders(restaurantId, statuses);
}

export async function fetchWaiterCalls(
  restaurantId: string,
  statuses?: CallStatus[]
) {
  return getWaiterCalls(restaurantId, statuses);
}
