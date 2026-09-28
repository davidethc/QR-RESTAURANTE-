"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import {
  cancelCounterSaleSchema,
  createCounterSaleSchema,
  type CancelCounterSaleInput,
  type CreateCounterSaleInput,
} from "@/lib/validations/counter";
import type { ActionResult } from "@/types/actions";
import type { Bill, CounterSale } from "@/types/billing";

/**
 * Venta de mostrador (para llevar). Crear la venta manda el pedido a cocina
 * como "Para llevar #N" y deja su cuenta abierta; se cobra con recordPayment
 * (billing.ts) como cualquier cuenta. Al entregarse el último pedido de una
 * venta ya pagada, la base la cierra sola (migración C4).
 *
 * Quién: crear, OWNER/ADMIN/WAITER (los que toman pedidos); cancelar,
 * OWNER/ADMIN. Lo decide la RPC, no esta capa.
 */

const GENERIC_ERROR = "No se pudo completar la operación. Intenta de nuevo.";

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

function revalidateCounter() {
  revalidatePath("/orders");
  revalidatePath("/kitchen");
  revalidatePath("/cash");
}

async function run<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await callUntypedRpc<T>(supabase, fn, args);
    if (error) {
      // P0001 = RAISE EXCEPTION de la RPC: mensaje pensado para el usuario.
      if (error.code === "P0001") return { ok: false, error: error.message };
      console.error(`[rpc ${fn}]`, error.code, error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    if (data === null) return { ok: false, error: GENERIC_ERROR };
    revalidateCounter();
    return { ok: true, data };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Crea la venta. `idempotencyKey` la genera el formulario al abrirse
 * (crypto.randomUUID()) y se reutiliza en cada reintento: si la red falla
 * después de crearla, reintentar devuelve la misma venta (`replayed: true`)
 * en vez de mandar un segundo pedido a cocina.
 */
export async function createCounterSale(
  input: CreateCounterSaleInput
): Promise<ActionResult<CounterSale>> {
  const parsed = createCounterSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<CounterSale>("create_counter_sale", {
    p_items: v.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      notes: item.notes ?? null,
    })),
    p_idempotency_key: v.idempotencyKey,
    p_notes: v.notes ?? null,
    p_customer_label: v.customerLabel ?? null,
    p_restaurant_id: v.restaurantId ?? null,
  });
}

/** Cancela una venta sin pagos vigentes: anula la cuenta y sus pedidos en curso. */
export async function cancelCounterSale(
  input: CancelCounterSaleInput
): Promise<ActionResult<Bill>> {
  const parsed = cancelCounterSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>("cancel_counter_sale", {
    p_bill_id: parsed.data.billId,
    p_reason: parsed.data.reason,
  });
}
