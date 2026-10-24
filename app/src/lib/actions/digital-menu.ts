"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { userFacingDbError, type DbErrorLike } from "@/lib/db-errors";
import {
  acceptOnlineOrderSchema,
  deliverySettingsSchema,
  idSchema,
  parseDbHint,
  pauseSchema,
  paymentMethodSettingsSchema,
  placeOnlineOrderSchema,
  quoteSchema,
  rejectOnlineOrderSchema,
  serviceTypeSchema,
  tokenSchema,
  whatsappSchema,
  type DeliverySettingsInput,
  type PaymentMethodSettingsInput,
  type PlaceOnlineOrderInput,
} from "@/lib/digital-menu";
import { getPendingOnlineOrders } from "@/lib/queries/digital-menu";
import type { ActionResult } from "@/types/actions";
import type {
  DigitalMenuSettings,
  OnlineAddress,
  OnlineOrder,
  OnlineQuote,
  OnlineServiceType,
  PausePreset,
  StaffOnlineContact,
  StaffOnlineOrder,
} from "@/types/digital-menu";

type Fail = { ok: false; error: string; field?: string; code?: string };

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }): Fail {
  const issue = error.issues[0];
  return {
    ok: false,
    error: issue?.message ?? "Revisa los datos.",
    field: issue?.path.map(String).join(".") || undefined,
  };
}

/**
 * Like `dbFailure`, plus the RPC hint: `field=` points the form at the input,
 * `state=` / `rate_limit=` become `code` so the page can show the right notice.
 */
function rpcFailure(error: DbErrorLike & { hint?: string | null }, context: string): Fail {
  const hint = parseDbHint(error.hint);
  return {
    ok: false,
    error: userFacingDbError(error, context),
    ...(hint.field ? { field: hint.field } : {}),
    ...(hint.state ? { code: `state:${hint.state}` } : {}),
    ...(hint.rateLimit ? { code: `rate_limit:${hint.rateLimit}` } : {}),
  };
}

// ─────────────────────────── Public (anon) ────────────────────────────

export async function quoteOnlineOrder(input: {
  slug: string;
  serviceType: OnlineServiceType;
  items: unknown[];
}): Promise<ActionResult<OnlineQuote>> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { data, error } = await createPublicClient().rpc("quote_online_order", {
    p_slug: parsed.data.slug,
    p_service_type: parsed.data.serviceType,
    p_items: parsed.data.items,
  });
  if (error) return rpcFailure(error, "quoteOnlineOrder");
  return { ok: true, data: data as unknown as OnlineQuote };
}

export async function placeOnlineOrder(input: PlaceOnlineOrderInput): Promise<ActionResult<OnlineOrder>> {
  const parsed = placeOnlineOrderSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const v = parsed.data;
  const address: OnlineAddress | undefined = v.serviceType === "delivery" ? v.address : undefined;

  const { data, error } = await createPublicClient().rpc("place_online_order", {
    p_slug: v.slug,
    p_service_type: v.serviceType,
    p_items: v.items,
    p_client_request_id: v.clientRequestId,
    p_customer_name: v.customerName,
    p_customer_phone: v.customerPhone,
    p_payment_method: v.paymentMethod,
    ...(address ? { p_delivery_address: { ...address } } : {}),
    ...(v.paysWithAmount !== undefined ? { p_pays_with_amount: v.paysWithAmount } : {}),
    ...(v.comment ? { p_general_comment: v.comment } : {}),
  });
  if (error) return rpcFailure(error, "placeOnlineOrder");
  return { ok: true, data: data as unknown as OnlineOrder };
}

export async function fetchOnlineOrder(token: string): Promise<ActionResult<OnlineOrder>> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return firstIssue(parsed.error);
  const { data, error } = await createPublicClient().rpc("get_online_order", { p_token: parsed.data });
  if (error) return rpcFailure(error, "fetchOnlineOrder");
  return { ok: true, data: data as unknown as OnlineOrder };
}

export async function confirmOnlineOrder(token: string): Promise<ActionResult<OnlineOrder>> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return firstIssue(parsed.error);
  const { data, error } = await createPublicClient().rpc("confirm_online_order", { p_token: parsed.data });
  if (error) return rpcFailure(error, "confirmOnlineOrder");
  return { ok: true, data: data as unknown as OnlineOrder };
}

// ─────────────────────────── Settings (managers) ───────────────────────

function settingsDone(data: unknown): ActionResult<DigitalMenuSettings> {
  revalidatePath("/settings");
  revalidatePath("/settings/menu-digital");
  return { ok: true, data: data as DigitalMenuSettings };
}

export async function setDigitalMenuWhatsapp(input: {
  restaurantId: string;
  number: string;
  volume?: string;
}): Promise<ActionResult<DigitalMenuSettings>> {
  const parsed = whatsappSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_digital_menu_whatsapp", {
    p_restaurant_id: parsed.data.restaurantId,
    p_whatsapp_number: parsed.data.number,
    ...(parsed.data.volume ? { p_monthly_volume: parsed.data.volume } : {}),
  });
  if (error) return rpcFailure(error, "setDigitalMenuWhatsapp");
  return settingsDone(data);
}

export async function activateDigitalMenu(restaurantId: string): Promise<ActionResult<DigitalMenuSettings>> {
  const parsed = idSchema.safeParse(restaurantId);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activate_digital_menu", { p_restaurant_id: parsed.data });
  if (error) return rpcFailure(error, "activateDigitalMenu");
  return settingsDone(data);
}

export async function pauseDigitalMenu(input: {
  restaurantId: string;
  preset: PausePreset;
  from?: string;
  until?: string;
}): Promise<ActionResult<DigitalMenuSettings>> {
  const parsed = pauseSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pause_digital_menu", {
    p_restaurant_id: v.restaurantId,
    p_preset: v.preset,
    ...(v.preset === "custom" && v.from ? { p_from: v.from } : {}),
    ...(v.preset === "custom" && v.until ? { p_until: v.until } : {}),
  });
  if (error) return rpcFailure(error, "pauseDigitalMenu");
  return settingsDone(data);
}

export async function resumeDigitalMenu(restaurantId: string): Promise<ActionResult<DigitalMenuSettings>> {
  const parsed = idSchema.safeParse(restaurantId);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resume_digital_menu", { p_restaurant_id: parsed.data });
  if (error) return rpcFailure(error, "resumeDigitalMenu");
  return settingsDone(data);
}

export async function saveDeliverySettings(
  restaurantId: string,
  input: DeliverySettingsInput
): Promise<ActionResult<DigitalMenuSettings>> {
  const id = idSchema.safeParse(restaurantId);
  if (!id.success) return firstIssue(id.error);
  const parsed = deliverySettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_delivery_settings", {
    p_restaurant_id: id.data,
    p_data: {
      ...v,
      // A disabled threshold keeps no stale amount.
      free_shipping_min_amount: v.free_shipping_enabled ? v.free_shipping_min_amount : null,
      min_purchase_amount: v.min_purchase_enabled ? v.min_purchase_amount : null,
    },
  });
  if (error) return rpcFailure(error, "saveDeliverySettings");
  return settingsDone(data);
}

export async function savePaymentMethodSettings(
  restaurantId: string,
  channel: OnlineServiceType,
  input: PaymentMethodSettingsInput
): Promise<ActionResult<DigitalMenuSettings>> {
  const id = idSchema.safeParse(restaurantId);
  if (!id.success) return firstIssue(id.error);
  const ch = serviceTypeSchema.safeParse(channel);
  if (!ch.success) return firstIssue(ch.error);
  const parsed = paymentMethodSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_payment_method_settings", {
    p_restaurant_id: id.data,
    p_channel: ch.data,
    p_data: parsed.data,
  });
  if (error) return rpcFailure(error, "savePaymentMethodSettings");
  return settingsDone(data);
}

// ─────────────────────────── Online orders (staff) ─────────────────────

export async function listPendingOnlineOrders(restaurantId: string): Promise<ActionResult<StaffOnlineOrder[]>> {
  const parsed = idSchema.safeParse(restaurantId);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    return { ok: true, data: await getPendingOnlineOrders(parsed.data) };
  } catch (e) {
    return rpcFailure(e as DbErrorLike, "listPendingOnlineOrders");
  }
}

/** Opening an order marks it reviewed (no longer "Nuevo") and returns the contact. */
export async function reviewOnlineOrder(orderId: string): Promise<ActionResult<StaffOnlineContact>> {
  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const review = await supabase.rpc("review_online_order", { p_order_id: parsed.data });
  if (review.error) return rpcFailure(review.error, "reviewOnlineOrder");
  const { data, error } = await supabase.rpc("get_order_contact", { p_order_id: parsed.data });
  if (error) return rpcFailure(error, "getOnlineOrderContact");
  const contact = (data ?? {}) as { customer_phone?: string | null; delivery_address?: OnlineAddress | null };
  return {
    ok: true,
    data: { customerPhone: contact.customer_phone ?? null, deliveryAddress: contact.delivery_address ?? null },
  };
}

function ordersDone() {
  revalidatePath("/orders");
  revalidatePath("/kitchen");
  revalidatePath("/cash");
}

export async function acceptOnlineOrder(input: {
  orderId: string;
  shippingCost?: number;
}): Promise<ActionResult> {
  const parsed = acceptOnlineOrderSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_online_order", {
    p_order_id: parsed.data.orderId,
    ...(parsed.data.shippingCost !== undefined ? { p_shipping_cost: parsed.data.shippingCost } : {}),
  });
  if (error) return rpcFailure(error, "acceptOnlineOrder");
  ordersDone();
  return { ok: true, data: undefined };
}

export async function rejectOnlineOrder(input: { orderId: string; reason?: string }): Promise<ActionResult> {
  const parsed = rejectOnlineOrderSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_online_order", {
    p_order_id: parsed.data.orderId,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
  });
  if (error) return rpcFailure(error, "rejectOnlineOrder");
  ordersDone();
  return { ok: true, data: undefined };
}
