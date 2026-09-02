"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CallType, CallStatus } from "@/config/constants";
import type { ActionResult } from "@/types/actions";

export async function callWaiter(
  sessionToken: string,
  type: CallType
): Promise<ActionResult<string>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_waiter_call", {
    p_session_token: sessionToken,
    p_type: type,
  });

  if (error) return { ok: false, error: error.message };
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
