"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTableSession } from "@/lib/session";
import type { CallType, CallStatus } from "@/config/constants";
import type { ActionResult } from "@/types/actions";
import type {} from "@/types/orders";

export async function callWaiter(
  type: CallType
): Promise<ActionResult<string>> {
  const session = await getTableSession();
  if (!session) {
    return {
      ok: false,
      error: "No encontramos tu mesa. Escanea el código QR nuevamente.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_waiter_call", {
    p_session_token: session.sessionToken,
    p_type: type,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * El mesero pide la cuenta por el cliente, cuando se la piden de viva voz
 * en vez de por el teléfono.
 *
 * La regla de "solo con pedidos" la aplica la base, no esta función: da
 * igual por dónde entre la solicitud, la condición es la misma.
 */
export async function requestBillAsStaff(
  tableId: string
): Promise<ActionResult<string>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("request_bill_as_staff", {
    p_table_id: tableId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/tables");
  revalidatePath("/orders");
  return { ok: true, data };
}

export async function handleCall(
  callId: string,
  status: Extract<CallStatus, "ACCEPTED" | "ATTENDED" | "REJECTED">
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("handle_waiter_call", {
    p_call_id: callId,
    p_status: status,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}
