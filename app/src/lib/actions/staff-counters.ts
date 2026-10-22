"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseStaffCounters, type StaffCounters } from "@/lib/staff-counters";
import type { ActionResult } from "@/types/actions";

const idSchema = z.string().uuid();

/** Contadores del personal (RPC `get_staff_counters`; la RPC valida membresía). */
export async function fetchStaffCounters(
  restaurantId: string
): Promise<ActionResult<StaffCounters>> {
  if (!idSchema.safeParse(restaurantId).success) return { ok: false, error: "Datos inválidos." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_staff_counters", {
      p_restaurant_id: restaurantId,
    });
    if (error) {
      console.error("[rpc get_staff_counters]", error.code, error.message);
      return { ok: false, error: "No se pudieron cargar los contadores." };
    }
    return { ok: true, data: parseStaffCounters(data) };
  } catch {
    return { ok: false, error: "No se pudieron cargar los contadores." };
  }
}
