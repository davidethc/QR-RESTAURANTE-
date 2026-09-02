"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTableSession } from "@/lib/session";
import type { CallType, CallStatus } from "@/config/constants";
import type { ActionResult } from "@/types/actions";
import type { SessionCall } from "@/types/orders";

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

export async function getSessionCalls(): Promise<ActionResult<SessionCall[]>> {
  const session = await getTableSession();
  if (!session) {
    return {
      ok: false,
      error: "No encontramos tu mesa. Escanea el código QR nuevamente.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_session_calls", {
    p_session_token: session.sessionToken,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as SessionCall[] };
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
