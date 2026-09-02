"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CartItem } from "@/types/menu";
import type { CustomerOrder, SessionOrderSummary } from "@/types/staff";
import type { ActionResult } from "@/types/actions";

export async function createOrder(
  sessionToken: string,
  items: CartItem[],
  notes?: string
): Promise<ActionResult<string>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_customer_order", {
    p_session_token: sessionToken,
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
  sessionToken: string,
  orderId: string
): Promise<ActionResult<CustomerOrder>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_customer_order", {
    p_session_token: sessionToken,
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as CustomerOrder };
}

export async function getSessionOrders(
  sessionToken: string
): Promise<ActionResult<SessionOrderSummary[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_session_orders", {
    p_session_token: sessionToken,
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
  return { ok: true, data: undefined };
}

export async function markReady(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_order_ready", {
    p_order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/kitchen");
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
