"use server";

import { createClient } from "@/lib/supabase/server";
import { getTableSession } from "@/lib/session";
import type { SessionCall } from "@/types/orders";
import type { SessionOrderSummary } from "@/types/staff";
import type { ActionResult } from "@/types/actions";

export interface TableStatus {
  orders: SessionOrderSummary[];
  calls: SessionCall[];
}

/**
 * Todo lo que la mesa tiene en curso, en una sola ida y vuelta.
 *
 * Antes esto eran dos consultas desde dos componentes distintos, cada
 * una con su propio ciclo: el aviso de pedidos ni siquiera se
 * refrescaba (se pintaba una vez en el servidor y se quedaba
 * congelado), y el de solicitudes sondeaba por su cuenta. Para el
 * cliente es un solo dato — "qué tengo pendiente en mi mesa" — así que
 * viaja junto.
 *
 * Los dos RPC van en paralelo: son independientes y ninguno depende
 * del resultado del otro.
 */
export async function getTableStatus(): Promise<ActionResult<TableStatus>> {
  const session = await getTableSession();
  if (!session) {
    return {
      ok: false,
      error: "No encontramos tu mesa. Escanea el código QR nuevamente.",
    };
  }

  const supabase = await createClient();

  const [orders, calls] = await Promise.all([
    supabase.rpc("get_session_orders", {
      p_session_token: session.sessionToken,
    }),
    supabase.rpc("get_session_calls", {
      p_session_token: session.sessionToken,
    }),
  ]);

  if (orders.error) return { ok: false, error: orders.error.message };
  if (calls.error) return { ok: false, error: calls.error.message };

  return {
    ok: true,
    data: {
      orders: (orders.data ?? []) as unknown as SessionOrderSummary[],
      calls: (calls.data ?? []) as unknown as SessionCall[],
    },
  };
}
