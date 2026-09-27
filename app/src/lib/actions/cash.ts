"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import {
  addCashMovementSchema,
  cashSessionIdSchema,
  closeCashSessionSchema,
  openCashSessionSchema,
  type AddCashMovementInput,
  type CloseCashSessionInput,
  type OpenCashSessionInput,
} from "@/lib/validations/cash";
import type { ActionResult } from "@/types/actions";
import type {
  CashMovement,
  CashSessionOpened,
  CashSessionSummary,
} from "@/types/billing";

/**
 * Caja (módulo 1, M9). El cierre es ciego para el mesero antes y después de
 * cerrar: la RPC no le devuelve esperados, conteos ni diferencias, y la
 * tabla cash_sessions (que el mesero puede leer) no los guarda. Para ver
 * esos montos se usa getCashSessionSummary como OWNER/ADMIN; nunca leer
 * cash_sessions directo para eso.
 */

function revalidateCash() {
  revalidatePath("/orders");
  revalidatePath("/tables");
  revalidatePath("/cash");
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

async function run<T>(
  fn: string,
  args: Record<string, unknown>,
  options: { revalidate: boolean }
): Promise<ActionResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await callUntypedRpc<T>(supabase, fn, args);
    if (error) {
      // P0001 = RAISE EXCEPTION de la RPC: mensaje pensado para el usuario.
      // Cualquier otro código (constraint, tipo, permisos, PostgREST) es
      // interno y no se muestra crudo.
      if (error.code === "P0001") return { ok: false, error: error.message };
      console.error(`[rpc ${fn}]`, error.code, error.message);
      return { ok: false, error: "No se pudo completar la operación. Intenta de nuevo." };
    }
    if (options.revalidate) revalidateCash();
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "No se pudo completar la operación. Intenta de nuevo." };
  }
}

export async function openCashSession(input: OpenCashSessionInput): Promise<ActionResult<CashSessionOpened>> {
  const parsed = openCashSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<CashSessionOpened>(
    "open_cash_session",
    { p_register_id: parsed.data.registerId, p_opening_float: parsed.data.openingFloat },
    { revalidate: true }
  );
}

/** `idempotencyKey`: la genera el formulario al abrirse y se reutiliza en reintentos. */
export async function addCashMovement(input: AddCashMovementInput): Promise<ActionResult<CashMovement>> {
  const parsed = addCashMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<CashMovement>(
    "add_cash_movement",
    {
      p_cash_session_id: v.cashSessionId,
      p_type: v.type,
      p_reason: v.reason,
      p_amount: v.amount,
      p_description: v.description || null,
      p_idempotency_key: v.idempotencyKey,
    },
    { revalidate: true }
  );
}

export async function getCashSessionSummary(cashSessionId: string): Promise<ActionResult<CashSessionSummary>> {
  const parsed = cashSessionIdSchema.safeParse({ cashSessionId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<CashSessionSummary>(
    "get_cash_session_summary",
    { p_cash_session_id: parsed.data.cashSessionId },
    { revalidate: false }
  );
}

export async function closeCashSession(input: CloseCashSessionInput): Promise<ActionResult<CashSessionSummary>> {
  const parsed = closeCashSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<CashSessionSummary>(
    "close_cash_session",
    {
      p_cash_session_id: parsed.data.cashSessionId,
      p_counts: parsed.data.counts,
      p_notes: parsed.data.notes || null,
    },
    { revalidate: true }
  );
}
