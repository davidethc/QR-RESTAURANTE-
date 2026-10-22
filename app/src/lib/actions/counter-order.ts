"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_DB_ERROR } from "@/lib/db-errors";
import { isConfirmRequired, confirmMessage, parseFieldHint } from "@/lib/counter-order";
import {
  createCounterOrderSchema,
  updateCounterOrderSchema,
  type CreateCounterOrderInput,
  type UpdateCounterOrderInput,
} from "@/lib/validations/counter-order";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import type { CounterAddress } from "@/lib/counter-order";
import type { Json } from "@/types/database";
import type { ActionResult } from "@/types/actions";

/**
 * Pedido de mostrador con tipo explícito (M06). Envoltorios delgados sobre
 * create_counter_order / update_counter_order: los errores con HINT
 * "field=<campo>" vuelven con `field` (se pintan junto al campo) y
 * CONFIRM_REQUIRED vuelve con code "CONFIRM_REQUIRED" (diálogo de confirmación).
 */

export interface CounterOrderCreated {
  order_id: string;
  folio: number;
  short_code: string;
  table_session_id: string;
  counter_number: number;
  bill_id: string | null;
  bill_number: number | null;
  total: number;
  pay_later: boolean;
  replayed: boolean;
}

export interface CounterOrderUpdated {
  order_id: string;
  total: number;
  shipping_cost: number | null;
  total_delta: number;
}

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const issue = error.issues[0];
  const path = issue?.path ?? [];
  const field = path.length ? path.map(String).join(".") : undefined;
  return { ok: false as const, error: issue?.message ?? "Datos inválidos.", field };
}

function rpcFailure(
  error: { message: string; code?: string | null; hint?: string | null },
  context: string
) {
  if (error.code === "P0001") {
    if (isConfirmRequired(error.message)) {
      return { ok: false as const, error: confirmMessage(error.message), code: "CONFIRM_REQUIRED" };
    }
    const field = parseFieldHint(error.hint) ?? undefined;
    return { ok: false as const, error: error.message, field };
  }
  console.error(`[${context}]`, error.code ?? "sin código", error.message);
  return { ok: false as const, error: GENERIC_DB_ERROR };
}

function revalidate() {
  revalidatePath("/orders");
  revalidatePath("/kitchen");
  revalidatePath("/cash");
}

/** `clientRequestId` lo genera el formulario y se reutiliza en reintentos. */
export async function createCounterOrder(
  input: CreateCounterOrderInput
): Promise<ActionResult<CounterOrderCreated>> {
  const parsed = createCounterOrderSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_counter_order", {
      p_service_type: v.serviceType,
      p_items: v.items.map((i) => ({
        product_id: i.productId,
        ...(i.variantId ? { variant_id: i.variantId } : {}),
        quantity: i.quantity,
        notes: i.notes || null,
        ...(i.modifiers
          ? { modifiers: i.modifiers.map((m) => ({ option_id: m.optionId, ...(m.qty ? { qty: m.qty } : {}) })) }
          : {}),
      })) as Json,
      p_client_request_id: v.clientRequestId,
      p_customer_name: v.customerName || undefined,
      p_customer_phone: v.customerPhone || undefined,
      p_delivery_provider: v.deliveryProvider,
      p_external_order_id: v.externalOrderId || undefined,
      p_delivery_address: (v.deliveryAddress as Json | undefined) ?? undefined,
      p_shipping_cost: v.shippingCost,
      p_general_comment: v.generalComment || undefined,
      p_pay_later: v.payLater,
    });
    if (error) return rpcFailure(error, "createCounterOrder");
    if (!data) return { ok: false, error: GENERIC_DB_ERROR };
    revalidate();
    return { ok: true, data: data as unknown as CounterOrderCreated };
  } catch {
    return { ok: false, error: GENERIC_DB_ERROR };
  }
}

export async function updateCounterOrder(
  input: UpdateCounterOrderInput
): Promise<ActionResult<CounterOrderUpdated>> {
  const parsed = updateCounterOrderSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_counter_order", {
      p_order_id: v.orderId,
      p_changes: v.changes as Json,
      p_confirm_total_increase: v.confirmTotalIncrease ?? false,
    });
    if (error) return rpcFailure(error, "updateCounterOrder");
    if (!data) return { ok: false, error: GENERIC_DB_ERROR };
    revalidate();
    return { ok: true, data: data as unknown as CounterOrderUpdated };
  } catch {
    return { ok: false, error: GENERIC_DB_ERROR };
  }
}

export interface OrderContact {
  customerPhone: string | null;
  deliveryAddress: CounterAddress | null;
}

/**
 * Teléfono y dirección del pedido (PII). Ya no se leen de la tabla orders
 * (S3-F0): solo vía get_order_contact, que valida rol y restaurante.
 * TODO: tipar con supabase.rpc al regenerar database.ts tras aplicar la migración.
 */
export async function getOrderContact(orderId: string): Promise<ActionResult<OrderContact>> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false, error: GENERIC_DB_ERROR };
  try {
    const supabase = await createClient();
    const { data, error } = await callUntypedRpc<{
      customer_phone: string | null;
      delivery_address: CounterAddress | null;
    }>(supabase, "get_order_contact", { p_order_id: orderId });
    if (error || !data) return { ok: false, error: GENERIC_DB_ERROR };
    return { ok: true, data: { customerPhone: data.customer_phone, deliveryAddress: data.delivery_address } };
  } catch {
    return { ok: false, error: GENERIC_DB_ERROR };
  }
}
