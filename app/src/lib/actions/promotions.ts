"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_DB_ERROR } from "@/lib/db-errors";
import { parseFieldHint } from "@/lib/counter-order";
import { refreshPublicMenuTag } from "@/lib/public-menu-tag";
import { getMyRestaurant } from "@/lib/queries/staff";
import { promotionFormSchema, toPromotionPayload } from "@/lib/promotions";
import type { Json } from "@/types/database";
import type { ActionResult } from "@/types/actions";
import type { ActivePromotion, Promotion, PromotionChannel, PromotionRule } from "@/types/promotions";

/**
 * M13 promotions. Thin wrappers over save_promotion / delete_promotion /
 * get_active_promotions: the RPCs check the role (OWNER, ADMIN, MENU_MANAGER)
 * and validate everything again; errors with HINT "field=<name>" come back
 * with `field` so the form paints them next to the field.
 */

const idSchema = z.uuid({ error: "Promoción inválida" });
const CHANNELS = [
  "pos.tables",
  "pos.dine_in_no_table",
  "pos.takeaway",
  "pos.delivery",
  "digital_menu.tables",
  "digital_menu.pickup",
  "digital_menu.delivery",
] as const satisfies readonly PromotionChannel[];
const channelSchema = z.enum(CHANNELS);
const lineIdsSchema = z.array(z.uuid()).max(500);

type RpcError = { message: string; code?: string | null; hint?: string | null };

function rpcFailure(error: RpcError, context: string) {
  if (error.code === "P0001") {
    return { ok: false as const, error: error.message, field: parseFieldHint(error.hint) ?? undefined };
  }
  console.error(`[${context}]`, error.code ?? "sin código", error.message);
  if (error.code === "42501") return { ok: false as const, error: "No tienes permiso para gestionar promociones." };
  return { ok: false as const, error: GENERIC_DB_ERROR };
}

async function afterWrite() {
  revalidatePath("/menu");
  await refreshPublicMenuTag();
}

/** Creates (no id) or replaces every field of a promotion (id). */
export async function savePromotion(
  restaurantId: string,
  input: unknown,
  promotionId?: string | null
): Promise<ActionResult<Promotion>> {
  const rid = idSchema.safeParse(restaurantId);
  const pid = promotionId == null ? null : idSchema.safeParse(promotionId);
  if (!rid.success || (pid && !pid.success)) return { ok: false, error: "Promoción inválida" };
  const parsed = promotionFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: issue.path.map(String).join(".") || undefined };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_promotion", {
    p_restaurant_id: rid.data,
    p_data: toPromotionPayload(parsed.data) as unknown as Json,
    ...(pid ? { p_promotion_id: pid.data } : {}),
  });
  if (error) return rpcFailure(error, "savePromotion");
  await afterWrite();
  return { ok: true, data: data as unknown as Promotion };
}

export async function deletePromotion(promotionId: string): Promise<ActionResult> {
  const pid = idSchema.safeParse(promotionId);
  if (!pid.success) return { ok: false, error: "Promoción inválida" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_promotion", { p_promotion_id: pid.data });
  if (error) return rpcFailure(error, "deletePromotion");
  await afterWrite();
  return { ok: true, data: undefined };
}

/**
 * Promotions active today (restaurant local date) for one channel (null =
 * every channel, filtered on screen), for the order builders' display
 * estimate. The restaurant comes from the session.
 */
export async function getActivePromotions(channel: PromotionChannel | null): Promise<ActionResult<ActivePromotion[]>> {
  const ch = channelSchema.nullable().safeParse(channel);
  if (!ch.success) return { ok: false, error: "Canal inválido" };
  try {
    const { restaurant } = await getMyRestaurant();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_active_promotions", {
      p_restaurant_id: restaurant.id,
      ...(ch.data ? { p_channel: ch.data } : {}),
    });
    if (error) return rpcFailure(error, "getActivePromotions");
    return { ok: true, data: (data ?? []) as unknown as ActivePromotion[] };
  } catch (error) {
    console.error("[getActivePromotions]", error);
    return { ok: false, error: GENERIC_DB_ERROR };
  }
}

export interface LinePromo {
  id: string;
  subtotal: number;
  promo_discount: number;
  promotions: PromotionRule[] | null;
}

/** Net subtotal and promo snapshot of order lines already sent (RLS: staff of the restaurant). */
export async function getLinePromos(lineIds: string[]): Promise<ActionResult<LinePromo[]>> {
  const ids = lineIdsSchema.safeParse(lineIds);
  if (!ids.success) return { ok: false, error: "Líneas inválidas" };
  if (ids.data.length === 0) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("id, subtotal, promo_discount, promotions")
    .in("id", ids.data);
  if (error) return rpcFailure(error, "getLinePromos");
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      subtotal: Number(r.subtotal),
      promo_discount: Number(r.promo_discount ?? 0),
      promotions: Array.isArray(r.promotions) ? (r.promotions as unknown as PromotionRule[]) : null,
    })),
  };
}
