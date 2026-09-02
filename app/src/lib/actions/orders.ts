"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTableSession } from "@/lib/session";
import type { CartItem } from "@/types/menu";
import type { CustomerOrder, SessionOrderSummary } from "@/types/staff";
import type { ActionResult } from "@/types/actions";

const NO_SESSION_ERROR =
  "No encontramos tu mesa. Escanea el código QR nuevamente.";

/**
 * El token de sesión vive en una cookie httpOnly — el navegador nunca
 * lo ve ni puede pasarlo como argumento. Estas actions lo leen ellas
 * mismas, del lado del servidor; el cliente solo llama sin token.
 */
export async function createOrder(
  items: CartItem[],
  notes?: string
): Promise<ActionResult<string>> {
  const session = await getTableSession();
  if (!session) return { ok: false, error: NO_SESSION_ERROR };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_customer_order", {
    p_session_token: session.sessionToken,
    p_items: items.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      notes: item.notes || null,
    })),
    p_notes: notes,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function getOrderStatus(
  orderId: string
): Promise<ActionResult<CustomerOrder>> {
  const session = await getTableSession();
  if (!session) return { ok: false, error: NO_SESSION_ERROR };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_customer_order", {
    p_session_token: session.sessionToken,
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as CustomerOrder };
}

export async function getSessionOrders(): Promise<
  ActionResult<SessionOrderSummary[]>
> {
  const session = await getTableSession();
  if (!session) return { ok: false, error: NO_SESSION_ERROR };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_session_orders", {
    p_session_token: session.sessionToken,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as SessionOrderSummary[] };
}

export async function acceptOrder(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_order", { p_order_id: orderId });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

export async function rejectOrder(
  orderId: string,
  reason?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_order", {
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

export async function startPreparing(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_order_preparing", {
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/kitchen");
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

export async function markReady(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_order_ready", {
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/kitchen");
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

export async function markDelivered(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_order_delivered", {
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

export async function cancelOrder(
  orderId: string,
  reason?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}
