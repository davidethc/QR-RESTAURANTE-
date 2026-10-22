"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KitchenTicketsPayload } from "@/lib/kds";
import {
  kdsSettingsSchema,
  kitchenTicketsQuerySchema,
  ticketIdSchema,
  type KitchenTicketsQuery,
} from "@/lib/validations/kds";
import type { ActionResult } from "@/types/actions";

const GENERIC_ERROR = "No se pudo completar la operación. Intenta de nuevo.";

function fail(fn: string, error: { code?: string; message: string }): ActionResult<never> {
  // P0001 = RAISE EXCEPTION de la RPC: mensaje pensado para el usuario.
  if (error.code === "P0001") return { ok: false, error: error.message };
  console.error(`[rpc ${fn}]`, error.code, error.message);
  return { ok: false, error: GENERIC_ERROR };
}

export async function fetchKitchenTickets(
  input: KitchenTicketsQuery
): Promise<ActionResult<KitchenTicketsPayload>> {
  const parsed = kitchenTicketsQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_kitchen_tickets", {
      p_restaurant_id: parsed.data.restaurantId,
      p_status: parsed.data.status,
      p_limit: parsed.data.limit,
      p_offset: parsed.data.offset,
    });
    if (error) return fail("get_kitchen_tickets", error);
    return { ok: true, data: data as unknown as KitchenTicketsPayload };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function completeTicket(ticketId: string): Promise<ActionResult<{ replayed: boolean }>> {
  const parsed = ticketIdSchema.safeParse({ ticketId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_ticket", { p_ticket_id: ticketId });
    if (error) return fail("complete_ticket", error);
    revalidatePath("/kitchen");
    return { ok: true, data: { replayed: Boolean((data as { replayed?: boolean })?.replayed) } };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function returnTicketToPreparation(
  ticketId: string
): Promise<ActionResult<{ replayed: boolean }>> {
  const parsed = ticketIdSchema.safeParse({ ticketId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("return_ticket_to_preparation", {
      p_ticket_id: ticketId,
    });
    if (error) return fail("return_ticket_to_preparation", error);
    revalidatePath("/kitchen");
    return { ok: true, data: { replayed: Boolean((data as { replayed?: boolean })?.replayed) } };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function setKdsSettings(input: {
  restaurantId: string;
  enabled?: boolean;
  warnMinutes?: number;
  alertMinutes?: number;
}): Promise<ActionResult<{ kds_enabled: boolean; warn_minutes: number; alert_minutes: number }>> {
  const parsed = kdsSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") || undefined };
  }
  const v = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_kds_settings", {
      p_restaurant_id: v.restaurantId,
      p_enabled: v.enabled,
      p_warn_minutes: v.warnMinutes,
      p_alert_minutes: v.alertMinutes,
    });
    if (error) {
      if (error.code === "23514") {
        return { ok: false, error: "Umbrales inválidos: el rojo debe ser mayor que el amarillo." };
      }
      return fail("set_kds_settings", error);
    }
    revalidatePath("/kitchen");
    return {
      ok: true,
      data: data as unknown as { kds_enabled: boolean; warn_minutes: number; alert_minutes: number },
    };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}
