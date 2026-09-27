"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import { getTableSession } from "@/lib/session";
import {
  applyDiscountSchema,
  billIdSchema,
  forceCloseTableSchema,
  openBillSchema,
  recordPaymentSchema,
  restaurantIdSchema,
  removeDiscountSchema,
  setBillSplitSchema,
  voidBillSchema,
  voidPaymentSchema,
  type ApplyDiscountInput,
  type ForceCloseTableInput,
  type RecordPaymentInput,
  type RemoveDiscountInput,
  type SetBillSplitInput,
  type VoidBillInput,
  type VoidPaymentInput,
} from "@/lib/validations/billing";
import type { ActionResult } from "@/types/actions";
import type {
  Bill,
  OpenBillSummary,
  RecordPaymentResult,
  SessionBill,
} from "@/types/billing";

/**
 * Cobro (módulo 1). Toda la lógica de dinero vive en las RPCs (M10): aquí
 * solo se valida la forma, se llama y se traduce el resultado. Ninguna
 * action lanza: siempre resuelve a ActionResult.
 */

function revalidateBilling() {
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
    if (options.revalidate) revalidateBilling();
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "No se pudo completar la operación. Intenta de nuevo." };
  }
}

export async function openBill(tableSessionId: string): Promise<ActionResult<Bill>> {
  const parsed = openBillSchema.safeParse({ tableSessionId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>("open_bill", { p_table_session_id: parsed.data.tableSessionId }, { revalidate: true });
}

export async function getBill(billId: string): Promise<ActionResult<Bill>> {
  const parsed = billIdSchema.safeParse({ billId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>("get_bill", { p_bill_id: parsed.data.billId }, { revalidate: false });
}

export async function listOpenBills(restaurantId: string): Promise<ActionResult<OpenBillSummary[]>> {
  const parsed = restaurantIdSchema.safeParse({ restaurantId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<OpenBillSummary[]>(
    "list_open_bills",
    { p_restaurant_id: parsed.data.restaurantId },
    { revalidate: false }
  );
}

export async function setBillSplit(input: SetBillSplitInput): Promise<ActionResult<Bill>> {
  const parsed = setBillSplitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>(
    "set_bill_split",
    { p_bill_id: parsed.data.billId, p_mode: parsed.data.mode, p_parts: parsed.data.parts },
    { revalidate: true }
  );
}

export async function applyBillDiscount(input: ApplyDiscountInput): Promise<ActionResult<Bill>> {
  const parsed = applyDiscountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<Bill>(
    "apply_bill_discount",
    {
      p_bill_id: v.billId,
      p_kind: v.kind,
      p_value: v.value,
      p_reason: v.reason,
      p_order_item_id: v.orderItemId ?? null,
    },
    { revalidate: true }
  );
}

export async function removeBillDiscount(input: RemoveDiscountInput): Promise<ActionResult<Bill>> {
  const parsed = removeDiscountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>(
    "remove_bill_discount",
    { p_discount_id: parsed.data.discountId, p_reason: parsed.data.reason ?? null },
    { revalidate: true }
  );
}

/**
 * Registra un pago. `idempotencyKey` la genera el formulario al abrirse
 * (crypto.randomUUID()) y se reutiliza en cada reintento: si la red falla
 * después de cobrar, reintentar devuelve el mismo pago (`replayed: true`)
 * en vez de cobrar dos veces.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<ActionResult<RecordPaymentResult>> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const isCash = v.method === "CASH";
  return run<RecordPaymentResult>(
    "record_payment",
    {
      p_bill_id: v.billId,
      p_method: v.method,
      p_amount: v.amount,
      p_idempotency_key: v.idempotencyKey,
      p_tip_amount: v.tipAmount,
      p_tendered_amount: isCash ? (v.tenderedAmount ?? null) : null,
      p_reference: v.reference || null,
      p_card_type: v.cardType || null,
      p_items: v.items && v.items.length > 0 ? v.items : null,
      p_cash_session_id: v.cashSessionId ?? null,
      p_auto_close: v.autoClose,
    },
    { revalidate: true }
  );
}

export async function voidPayment(input: VoidPaymentInput): Promise<ActionResult<Bill>> {
  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>(
    "void_payment",
    { p_payment_id: parsed.data.paymentId, p_reason: parsed.data.reason },
    { revalidate: true }
  );
}

export async function closeBill(billId: string): Promise<ActionResult<Bill>> {
  const parsed = billIdSchema.safeParse({ billId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>("close_bill", { p_bill_id: parsed.data.billId }, { revalidate: true });
}

export async function voidBill(input: VoidBillInput): Promise<ActionResult<Bill>> {
  const parsed = voidBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return run<Bill>(
    "void_bill",
    { p_bill_id: parsed.data.billId, p_reason: parsed.data.reason },
    { revalidate: true }
  );
}

/**
 * Liberar una mesa con saldo pendiente (solo OWNER/ADMIN, con motivo).
 * Requiere M11. El cierre normal sigue siendo closeTableSession (tables.ts).
 */
export async function forceCloseTableSession(input: ForceCloseTableInput): Promise<ActionResult> {
  const parsed = forceCloseTableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await run<null>(
    "close_table_session",
    { p_table_id: parsed.data.tableId, p_force: true, p_reason: parsed.data.reason },
    { revalidate: true }
  );
  return result.ok ? { ok: true, data: undefined } : result;
}

/** Vista del cliente: estado de su cuenta con el token de su sesión (cookie). */
export async function getSessionBill(): Promise<ActionResult<SessionBill>> {
  const session = await getTableSession();
  if (!session) {
    return { ok: false, error: "No encontramos tu mesa. Escanea el código QR nuevamente." };
  }
  return run<SessionBill>("get_session_bill", { p_session_token: session.sessionToken }, { revalidate: false });
}
