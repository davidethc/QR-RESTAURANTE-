"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import type { ResolvedTableQr } from "@/types/restaurant";

export async function resolveQr(
  qrToken: string
): Promise<ActionResult<ResolvedTableQr>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("resolve_table_qr", {
    p_qr_token: qrToken,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "QR inválido" };

  return { ok: true, data: data[0] };
}

export async function closeTableSession(
  tableId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("close_table_session", {
    p_table_id: tableId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tables");
  return { ok: true, data: undefined };
}
