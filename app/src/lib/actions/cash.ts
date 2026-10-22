"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import {
  addCashMovementSchema,
  cashCutSchema,
  cashListSchema,
  type CashCutInput,
  cashSessionIdSchema,
  closeCashSessionSchema,
  openCashSessionSchema,
  type AddCashMovementInput,
  type CloseCashSessionInput,
  type OpenCashSessionInput,
} from "@/lib/validations/cash";
import type { ActionResult } from "@/types/actions";
import type {
  CashCutPrecheck,
  CashCutRow,
  CashMovementRow,
  RegisterCashStatus,
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
  revalidatePath("/cash/cortes");
  revalidatePath("/cash/movimientos");
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

/** Corte a ciegas. `skipPendingOrders` solo tras confirmación explícita del usuario. */
export async function cashCut(input: CashCutInput): Promise<ActionResult<CashSessionSummary>> {
  const parsed = cashCutSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Datos inválidos.", field: issue?.path.join(".") };
  }
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await callUntypedRpc<CashSessionSummary>(supabase, "cash_cut", {
      p_cash_session_id: v.cashSessionId,
      p_counts: v.counts,
      p_cash_float_left: v.cashFloatLeft,
      p_notes: v.notes || null,
      p_skip_pending_orders: v.skipPendingOrders,
    });
    if (error) {
      if (error.code === "P0001") {
        return {
          ok: false,
          error: error.message,
          code: error.hint === "PENDING_ORDERS" ? "PENDING_ORDERS" : undefined,
        };
      }
      console.error("[rpc cash_cut]", error.code, error.message);
      return { ok: false, error: "No se pudo guardar el corte. Intenta de nuevo." };
    }
    revalidateCash();
    return { ok: true, data: data as CashSessionSummary };
  } catch {
    return { ok: false, error: "No se pudo guardar el corte. Intenta de nuevo." };
  }
}

export async function getCashCutPrecheck(cashSessionId: string): Promise<ActionResult<CashCutPrecheck>> {
  const parsed = cashSessionIdSchema.safeParse({ cashSessionId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<CashCutPrecheck>(
    "get_cash_cut_precheck",
    { p_cash_session_id: parsed.data.cashSessionId },
    { revalidate: false }
  );
}

export async function getLastCashFloat(restaurantId: string): Promise<ActionResult<RegisterCashStatus[]>> {
  const parsed = z.uuid().safeParse(restaurantId);
  if (!parsed.success) return { ok: false, error: "Restaurante inválido" };
  return run<RegisterCashStatus[]>("get_last_cash_float", { p_restaurant_id: parsed.data }, { revalidate: false });
}

export async function listCashCuts(
  restaurantId: string,
  filters: { registerId?: string; limit?: number } = {}
): Promise<ActionResult<CashCutRow[]>> {
  const rid = z.uuid().safeParse(restaurantId);
  const f = cashListSchema.safeParse(filters);
  if (!rid.success || !f.success) return { ok: false, error: "Filtros inválidos." };
  return run<CashCutRow[]>(
    "list_cash_cuts",
    { p_restaurant_id: rid.data, p_register_id: f.data.registerId ?? null, p_limit: f.data.limit ?? 50 },
    { revalidate: false }
  );
}

export async function listCashMovements(
  restaurantId: string,
  filters: { registerId?: string; cashSessionId?: string; limit?: number } = {}
): Promise<ActionResult<CashMovementRow[]>> {
  const rid = z.uuid().safeParse(restaurantId);
  const f = cashListSchema.safeParse(filters);
  if (!rid.success || !f.success) return { ok: false, error: "Filtros inválidos." };
  return run<CashMovementRow[]>(
    "list_cash_movements",
    {
      p_restaurant_id: rid.data,
      p_register_id: f.data.registerId ?? null,
      p_cash_session_id: f.data.cashSessionId ?? null,
      p_limit: f.data.limit ?? 100,
    },
    { revalidate: false }
  );
}
