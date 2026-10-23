"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import { cancelCounterSaleSchema, type CancelCounterSaleInput } from "@/lib/validations/counter";
import type { ActionResult } from "@/types/actions";
import type { Bill } from "@/types/billing";

/**
 * Cancelar una venta de mostrador sin pagos (OWNER/ADMIN; lo decide la RPC).
 * Los pedidos de mostrador se crean con createCounterOrder (counter-order.ts).
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
