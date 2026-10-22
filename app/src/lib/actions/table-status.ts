"use server";

import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import { getTableSession } from "@/lib/session";
import type { SessionCall } from "@/types/orders";
import type { SessionOrderSummary } from "@/types/staff";
import type { ActionResult } from "@/types/actions";

export interface TableStatus {
  orders: SessionOrderSummary[];
  calls: SessionCall[];
  /** La cuenta de la sesión ya se cobró por completo (módulo de cobro). */
  billPaid: boolean;
  /** Datos de la sesión del cliente (M11); null si la consulta falló. */
  info: CustomerSessionInfo | null;
}

export interface CustomerSessionInfo {
  customerLabel: string | null;
  /** Falso si la cuenta ya se pidió o la sesión no está activa. */
  canOrder: boolean;
  billRequested: boolean;
  requireApproval: boolean;
  /** Segundos que faltan para poder volver a llamar, al momento de la consulta. */
  waiterCooldownLeft: number;
  billCooldownLeft: number;
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

  const [orders, calls, bill, sessionInfo] = await Promise.all([
    supabase.rpc("get_session_orders", {
      p_session_token: session.sessionToken,
    }),
    supabase.rpc("get_session_calls", {
      p_session_token: session.sessionToken,
    }),
    // Solo informativo: si falla (o el restaurante no usa cobro) la carta
    // sigue funcionando igual, sin aviso de "pagado".
    supabase.rpc("get_session_bill", {
      p_session_token: session.sessionToken,
    }),
    supabase.rpc("get_customer_session", {
      p_session_token: session.sessionToken,
    }),
  ]);

  if (orders.error) return dbFailure(orders.error, "getTableStatus");
  if (calls.error) return dbFailure(calls.error, "getTableStatus");

  return {
    ok: true,
    data: {
      orders: (orders.data ?? []) as unknown as SessionOrderSummary[],
      calls: (calls.data ?? []) as unknown as SessionCall[],
      billPaid: isPaid(bill.error ? null : bill.data),
      info: sessionInfo.error ? null : toInfo(sessionInfo.data),
    },
  };
}

function isPaid(bill: unknown): boolean {
  const status = (bill as { status?: string } | null)?.status;
  return status === "PAID" || status === "CLOSED";
}

function toInfo(raw: unknown): CustomerSessionInfo | null {
  const r = raw as {
    customer_label?: string | null;
    can_order?: boolean;
    bill_requested?: boolean;
    orders_require_approval?: boolean;
    waiter_cooldown_left?: number;
    bill_cooldown_left?: number;
  } | null;
  if (!r) return null;
  return {
    customerLabel: r.customer_label ?? null,
    canOrder: r.can_order !== false,
    billRequested: r.bill_requested === true,
    requireApproval: r.orders_require_approval !== false,
    waiterCooldownLeft: Number(r.waiter_cooldown_left ?? 0),
    billCooldownLeft: Number(r.bill_cooldown_left ?? 0),
  };
}
