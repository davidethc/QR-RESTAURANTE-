"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTableSession } from "@/lib/session";
import { dbFailure } from "@/lib/db-errors";
import {
  addTicketSchema,
  cancelOrderItemSchema,
  cancelOrderWithReasonSchema,
  openTableSchema,
  transferOrderSchema,
  type AddTicketInput,
  customerOrderSchema,
  staffOrderSchema,
  type CustomerOrderInput,
  type StaffOrderInput,
} from "@/lib/validations/orders";
import type { CustomerOrder } from "@/types/staff";
import type { ActionResult } from "@/types/actions";

const NO_SESSION_ERROR =
  "No encontramos tu mesa. Escanea el código QR nuevamente.";

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Pedido inválido.";
}

function toRpcItems(items: { productId: string; quantity: number; notes: string | null }[]) {
  return items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    notes: item.notes,
  }));
}

/**
 * El token de sesión vive en una cookie httpOnly — el navegador nunca
 * lo ve ni puede pasarlo como argumento. Estas actions lo leen ellas
 * mismas, del lado del servidor; el cliente solo llama sin token.
 *
 * `clientRequestId` es la clave de idempotencia del envío: el carrito la
 * reutiliza en los reintentos del mismo contenido, así un "Enviar" que
 * llegó a la base pero cuya respuesta se perdió no crea un pedido doble.
 */
export async function createOrder(
  input: CustomerOrderInput
): Promise<ActionResult<string>> {
  const parsed = customerOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const session = await getTableSession();
  if (!session) return { ok: false, error: NO_SESSION_ERROR };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_customer_order", {
    p_session_token: session.sessionToken,
    p_items: toRpcItems(parsed.data.items),
    p_notes: parsed.data.notes ?? undefined,
    p_client_request_id: parsed.data.clientRequestId,
  });

  if (error) return dbFailure(error, "createOrder");
  return { ok: true, data };
}

/**
 * El pedido que el mesero toma de viva voz, parado en la mesa.
 *
 * A diferencia de `createOrder`, no hay cookie de sesión que leer: el mesero
 * está autenticado como personal, no como esa mesa. La sesión de mesa la
 * resuelve la base a partir del `tableId` (y la crea si el cliente todavía no
 * había escaneado nada).
 *
 * El pedido nace ya en preparación, con el mesero registrado como quien lo
 * aceptó — es lo mismo que pasaría si el cliente lo mandara y él lo aceptara
 * acto seguido, así que no tiene sentido hacerle dar ese segundo paso.
 */
export async function createStaffOrder(
  input: StaffOrderInput
): Promise<ActionResult<string>> {
  const parsed = staffOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_staff_order", {
    p_table_id: parsed.data.tableId,
    p_items: toRpcItems(parsed.data.items),
    p_notes: parsed.data.notes ?? undefined,
    p_client_request_id: parsed.data.clientRequestId,
  });

  if (error) return dbFailure(error, "createStaffOrder");

  revalidatePath("/tables");
  revalidatePath("/orders");
  revalidatePath("/kitchen");
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

  if (error) return dbFailure(error, "getOrderStatus");
  return { ok: true, data: data as unknown as CustomerOrder };
}

/**
 * "Aceptar" deja el pedido preparándose de una vez — separar "aceptado"
 * de "empezar a preparar" en dos clics no representa ningún momento
 * real distinto en la cocina (se acepta y se empieza a cocinar al
 * mismo tiempo) y solo agrega un paso más para personal que ya anda
 * ocupado. `accept_and_prepare_order` hace ambas cosas en una sola
 * transacción de Postgres — si algo falla, no queda a medias (nunca
 * un pedido "aceptado pero no marcado preparando" por un error de red
 * entre dos llamadas separadas). `accept_order` y `start_order_preparing`
 * quedan en la base sin pantalla que las use.
 */
export async function acceptOrder(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("accept_and_prepare_order", {
    p_order_id: orderId,
  });
  if (error) return dbFailure(error, "acceptOrder");

  revalidatePath("/orders");
  revalidatePath("/kitchen");
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

  if (error) return dbFailure(error, "rejectOrder");
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

/**
 * "Listo" de la cocina. Acepta ACCEPTED o PREPARING. Si el restaurante
 * tiene `kitchen_ready_step = false`, la base solo se lo permite a
 * OWNER/ADMIN (la cocina está en modo "solo mirar").
 */
export async function markReady(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_order_ready", {
    p_order_id: orderId,
  });

  if (error) return dbFailure(error, "markReady");
  revalidatePath("/kitchen");
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

/**
 * "Entregado" del mesero. Acepta ACCEPTED, PREPARING o READY: no hace
 * falta que la cocina lo haya marcado listo (en modo "solo mirar" nunca
 * lo hace). Desde PREPARING no rellena `ready_at`, para no inventar
 * tiempos de cocina. En el panel se llama diferido, con "Deshacer"
 * (`useDeferredDelivery`).
 */
export async function markDelivered(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_order_delivered", {
    p_order_id: orderId,
  });

  if (error) return dbFailure(error, "markDelivered");
  revalidatePath("/orders");
  revalidatePath("/kitchen");
  return { ok: true, data: undefined };
}

export type TicketResult = {
  orderId: string;
  ticketId: string;
  ticketNumber: number;
  folio: number;
  shortCode: string;
};

function revalidateTables() {
  revalidatePath("/tables");
  revalidatePath("/orders");
  revalidatePath("/kitchen");
}

/** Abre la mesa (sesión) sin crear pedido: el pedido nace con la primera comanda. */
export async function openTable(
  tableId: string
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = openTableSchema.safeParse({ tableId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_table", {
    p_table_id: parsed.data.tableId,
  });
  if (error) return dbFailure(error, "openTable");

  revalidateTables();
  return { ok: true, data: { sessionId: (data as { session_id: string }).session_id } };
}

/** Comanda nueva (#N+1) de un pedido, o la #1 de una mesa recién abierta (`orderId` null). */
export async function addTicket(
  input: AddTicketInput
): Promise<ActionResult<TicketResult>> {
  const parsed = addTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_ticket", {
    p_order_id: parsed.data.orderId as string,
    p_items: toRpcItems(parsed.data.items),
    p_request_id: parsed.data.requestId,
    p_table_id: parsed.data.tableId,
  });
  if (error) return dbFailure(error, "addTicket");

  const r = data as {
    order_id: string;
    ticket_id: string;
    ticket_number: number;
    folio: number;
    short_code: string;
  };
  revalidateTables();
  return {
    ok: true,
    data: {
      orderId: r.order_id,
      ticketId: r.ticket_id,
      ticketNumber: r.ticket_number,
      folio: r.folio,
      shortCode: r.short_code,
    },
  };
}

/** Cancela un producto de una comanda ya enviada (motivo obligatorio, auditado). */
export async function cancelOrderItem(
  orderItemId: string,
  reason: string
): Promise<ActionResult> {
  const parsed = cancelOrderItemSchema.safeParse({ orderItemId, reason });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order_item", {
    p_order_item_id: parsed.data.orderItemId,
    p_reason: parsed.data.reason,
  });
  if (error) return dbFailure(error, "cancelOrderItem");

  revalidateTables();
  return { ok: true, data: undefined };
}

/** Cancela el pedido completo con motivo obligatorio y libera la mesa. */
export async function cancelOrderWithReason(
  orderId: string,
  reason: string
): Promise<ActionResult> {
  const parsed = cancelOrderWithReasonSchema.safeParse({ orderId, reason });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order_with_reason", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });
  if (error) return dbFailure(error, "cancelOrderWithReason");

  revalidateTables();
  return { ok: true, data: undefined };
}

/** Mueve el pedido (sesión, comandas, cuenta y pagos) a una mesa disponible. */
export async function transferOrder(
  orderId: string,
  targetTableId: string
): Promise<ActionResult> {
  const parsed = transferOrderSchema.safeParse({ orderId, targetTableId });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_order", {
    p_order_id: parsed.data.orderId,
    p_target_table_id: parsed.data.targetTableId,
  });
  if (error) return dbFailure(error, "transferOrder");

  revalidateTables();
  return { ok: true, data: undefined };
}
