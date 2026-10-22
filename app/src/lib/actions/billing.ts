"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import { getTableSession } from "@/lib/session";
import { getPublicMenu } from "@/lib/queries/menu";
import { getMyRestaurant, getTopProducts } from "@/lib/queries/staff";
import { canHandleMoney } from "@/lib/permissions";
import { dbFailure } from "@/lib/db-errors";
import {
  addItemsToBillSchema,
  type AddItemsToBillInput,
  applyDiscountSchema,
  billIdSchema,
  forceCloseTableSchema,
  openBillSchema,
  recordPaymentSchema,
  recordPaymentsSchema,
  voidPaymentWithRefundSchema,
  restaurantIdSchema,
  removeDiscountSchema,
  setBillSplitSchema,
  voidBillSchema,
  voidPaymentSchema,
  type ApplyDiscountInput,
  type ForceCloseTableInput,
  type RecordPaymentInput,
  type RecordPaymentsInput,
  type VoidPaymentWithRefundInput,
  type RemoveDiscountInput,
  type SetBillSplitInput,
  type VoidBillInput,
  type VoidPaymentInput,
} from "@/lib/validations/billing";
import type { ActionResult } from "@/types/actions";
import type { PublicCategory } from "@/types/menu";
import type { TopProduct } from "@/types/staff";
import type {
  Bill,
  OpenBillSummary,
  BillPaymentContext,
  RecordPaymentResult,
  RecordPaymentsResult,
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
    // Solo P0001 (RAISE EXCEPTION de la RPC) llega al usuario; ver db-errors.
    if (error) return dbFailure(error, `rpc ${fn}`);
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

/**
 * Cobro con varios métodos en una sola transacción (M07-T04). Tarjeta y
 * transferencia se aplican por su monto exacto; el efectivo cubre el resto
 * con cambio. `requestId` (idempotencia) la genera el formulario.
 */
export async function recordPayments(input: RecordPaymentsInput): Promise<ActionResult<RecordPaymentsResult>> {
  const parsed = recordPaymentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<RecordPaymentsResult>(
    "record_payments",
    {
      p_bill_id: v.billId,
      p_amount: v.amount,
      p_payments: v.payments.map((p) => ({
        method: p.method,
        received: p.received,
        reference: p.reference || null,
      })),
      p_request_id: v.requestId,
      p_tip_amount: v.tipAmount,
      p_items: v.items && v.items.length > 0 ? v.items : null,
      p_auto_close: v.autoClose,
    },
    { revalidate: true }
  );
}

/** Anula un pago; el reembolso puede hacerse con otro método (queda en el registro de seguridad). */
export async function voidPaymentWithRefund(
  input: VoidPaymentWithRefundInput
): Promise<ActionResult<{ bill: Bill }>> {
  const parsed = voidPaymentWithRefundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await run<Bill | { bill: Bill }>(
    "void_payment_with_refund",
    {
      p_payment_id: parsed.data.paymentId,
      p_reason: parsed.data.reason,
      p_refund_method: parsed.data.refundMethod ?? null,
    },
    { revalidate: true }
  );
  if (!result.ok) return result;
  const data = result.data;
  return { ok: true, data: "bill" in data ? data : { bill: data } };
}

/**
 * Datos de lectura para la hoja de cobro que bill_json aún no trae: número
 * de cada pago (payments.number) y lo que el cliente indicó al pedir
 * (orders.preferred_payment_method / pays_with_amount) + si todos los pedidos
 * de la cuenta están cancelados. Solo lectura, bajo RLS.
 */
export async function getBillPaymentContext(billId: string): Promise<ActionResult<BillPaymentContext>> {
  const parsed = billIdSchema.safeParse({ billId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  try {
    const supabase = await createClient();
    const { data: bill } = await supabase
      .from("bills")
      .select("table_session_id")
      .eq("id", parsed.data.billId)
      .maybeSingle();
    const [pays, orders] = await Promise.all([
      supabase.from("payments").select("id, number").eq("bill_id", parsed.data.billId),
      bill
        ? supabase
            .from("orders")
            .select("status, cancelled, preferred_payment_method, pays_with_amount, created_at")
            .eq("table_session_id", bill.table_session_id)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const numbers: Record<string, number> = {};
    for (const p of pays.data ?? []) if (p.number !== null) numbers[p.id] = p.number;
    const list = orders.data ?? [];
    const isCancelled = (o: { status: string; cancelled: boolean }) => o.cancelled || o.status === "CANCELLED";
    const pref = list.find((o) => !isCancelled(o) && o.preferred_payment_method);
    const map = { cash: "CASH", card: "CARD", transfer: "TRANSFER" } as const;
    const key = pref?.preferred_payment_method as keyof typeof map | undefined;
    return {
      ok: true,
      data: {
        paymentNumbers: numbers,
        preferredMethod: key && map[key] ? map[key] : null,
        paysWithAmount: pref?.pays_with_amount === null || pref === undefined ? null : Number(pref.pays_with_amount),
        allOrdersCancelled: list.length > 0 && list.every(isCancelled),
      },
    };
  } catch {
    return { ok: false, error: "No se pudo leer el detalle del pago." };
  }
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

/**
 * Agrega productos a una cuenta abierta desde la caja (OWNER/ADMIN). Con
 * `sendToKitchen` el pedido entra a cocina; si no, nace entregado ("se lo
 * llevó de la barra"). Idempotente: la clave la genera el selector al abrirse.
 */
export async function addItemsToBill(
  input: AddItemsToBillInput
): Promise<ActionResult<Bill & { replayed: boolean; added_order_id: string }>> {
  const parsed = addItemsToBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const result = await run<Bill & { replayed: boolean; added_order_id: string }>(
    "add_items_to_bill",
    {
      p_bill_id: v.billId,
      p_items: v.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        notes: item.notes ?? null,
      })),
      p_idempotency_key: v.idempotencyKey,
      p_send_to_kitchen: v.sendToKitchen,
    },
    { revalidate: true }
  );
  if (result.ok && v.sendToKitchen) revalidatePath("/kitchen");
  return result;
}

/** Carta y más pedidos para el selector de la hoja de cobro. */
export async function getChargeMenu(): Promise<
  ActionResult<{ categories: PublicCategory[]; topProducts: TopProduct[] }>
> {
  try {
    const session = await getMyRestaurant();
    if (!canHandleMoney(session.role)) return { ok: false, error: "No autorizado para cobrar." };
    const [menu, topProducts] = await Promise.all([
      getPublicMenu(session.restaurant.slug),
      getTopProducts(session.restaurant.id),
    ]);
    return { ok: true, data: { categories: menu.categories, topProducts } };
  } catch {
    return { ok: false, error: "No se pudo cargar la carta. Intenta de nuevo." };
  }
}

/** Vista del cliente: estado de su cuenta con el token de su sesión (cookie). */
export async function getSessionBill(): Promise<ActionResult<SessionBill>> {
  const session = await getTableSession();
  if (!session) {
    return { ok: false, error: "No encontramos tu mesa. Escanea el código QR nuevamente." };
  }
  return run<SessionBill>("get_session_bill", { p_session_token: session.sessionToken }, { revalidate: false });
}
