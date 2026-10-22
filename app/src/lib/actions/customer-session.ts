"use server";

import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import { clearQrToken, getQrToken, getTableSession } from "@/lib/session";
import { tableNameSchema } from "@/lib/validations/qr-client";
import type { ActionResult } from "@/types/actions";

const NO_SESSION_ERROR = "No encontramos tu mesa. Escanea el código QR nuevamente.";

export interface CustomerAccountOption {
  group: string;
  name: string;
  price: number;
  qty: number;
}
export interface CustomerAccountLine {
  name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  options: CustomerAccountOption[];
}
export interface CustomerAccountRound {
  order_number: number;
  folio: number | null;
  status: string;
  created_at: string;
  total: number;
  awaiting_approval: boolean;
  lines: CustomerAccountLine[];
}
export interface CustomerAccount {
  customer_label: string | null;
  bill_requested: boolean;
  total: number;
  rounds: CustomerAccountRound[];
}

/** El cliente escribe su nombre y se abre la mesa a su nombre. */
export async function openTableWithName(name: string): Promise<ActionResult> {
  const parsed = tableNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nombre inválido." };
  }
  const session = await getTableSession();
  if (!session) return { ok: false, error: NO_SESSION_ERROR };
  const qrToken = await getQrToken();
  if (!qrToken) {
    return { ok: false, error: "Escanea el código QR de la mesa otra vez para continuar." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_table_from_qr", {
    p_qr_token: qrToken,
    p_customer_label: parsed.data,
  });
  if (error) return dbFailure(error, "openTableWithName");

  await clearQrToken();
  return { ok: true, data: undefined };
}

/** "Ver cuenta": productos, variantes, extras y total de la mesa. */
export async function getCustomerAccount(): Promise<ActionResult<CustomerAccount>> {
  const session = await getTableSession();
  if (!session) return { ok: false, error: NO_SESSION_ERROR };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_customer_account", {
    p_session_token: session.sessionToken,
  });
  if (error) return dbFailure(error, "getCustomerAccount");
  return { ok: true, data: data as unknown as CustomerAccount };
}
