"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import {
  createStaffSchema,
  resetPasswordSchema,
  updateStaffSchema,
} from "@/lib/validations/staff";
import type { ActionResult } from "@/types/actions";

/**
 * Gestión de personal. Orden en cada acción: primero una RPC con la sesión
 * de quien llama decide si tiene permiso (la base es la única que decide);
 * recién después se usa la llave secreta para tocar la cuenta de acceso.
 */

const GENERIC_ERROR = "No se pudo completar la operación. Intenta de nuevo.";
const NO_SECRET_KEY =
  "Falta configurar SUPABASE_SECRET_KEY en el servidor para gestionar cuentas.";
/** Bloqueo "para siempre" de la cuenta de acceso de alguien desactivado. */
const BAN_FOREVER = "876000h";

function rpcError(fn: string, error: { message: string; code?: string }): string {
  // P0001 = RAISE EXCEPTION de la RPC: mensaje pensado para el usuario.
  if (error.code === "P0001") return error.message;
  console.error(`[rpc ${fn}]`, error.code, error.message);
  return GENERIC_ERROR;
}

export async function createStaffMember(
  restaurantId: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { fullName, email, role, password } = parsed.data;

  const supabase = await createClient();
  const allowed = await callUntypedRpc<boolean>(supabase, "can_manage_staff_role", {
    p_restaurant_id: restaurantId,
    p_role: role,
  });
  if (allowed.error) return { ok: false, error: rpcError("can_manage_staff_role", allowed.error) };
  if (!allowed.data) return { ok: false, error: "No puedes agregar personal con ese rol." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_SECRET_KEY };

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user) {
    if (created.error?.code === "email_exists") {
      return { ok: false, error: "Ese correo ya tiene una cuenta." };
    }
    console.error("[createStaffMember]", created.error?.code, created.error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const userId = created.data.user.id;
  const linked = await callUntypedRpc<string>(supabase, "add_staff_member", {
    p_restaurant_id: restaurantId,
    p_user_id: userId,
    p_role: role,
    p_full_name: fullName,
  });
  if (linked.error) {
    // Sin vínculo al restaurante la cuenta no sirve: no dejarla huérfana.
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: rpcError("add_staff_member", linked.error) };
  }

  revalidatePath("/staff");
  return { ok: true, data: undefined };
}

export async function updateStaffMember(input: unknown): Promise<ActionResult> {
  const parsed = updateStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { memberId, role, active } = parsed.data;

  const supabase = await createClient();
  const target = await callUntypedRpc<string>(supabase, "assert_can_manage_member", {
    p_member_id: memberId,
  });
  if (target.error || !target.data) {
    return { ok: false, error: target.error ? rpcError("assert_can_manage_member", target.error) : GENERIC_ERROR };
  }

  const updated = await callUntypedRpc<null>(supabase, "update_staff_member", {
    p_member_id: memberId,
    p_role: role,
    p_status: active ? "ACTIVE" : "INACTIVE",
  });
  if (updated.error) return { ok: false, error: rpcError("update_staff_member", updated.error) };

  // Desactivar ya le quita el acceso al panel; bloquear la cuenta además
  // corta la sesión que tenga abierta en cuanto expire su token.
  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin.auth.admin.updateUserById(target.data, {
      ban_duration: active ? "none" : BAN_FOREVER,
    });
    if (error) console.error("[updateStaffMember ban]", error.code, error.message);
  }

  revalidatePath("/staff");
  return { ok: true, data: undefined };
}

export async function resetStaffPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const target = await callUntypedRpc<string>(supabase, "assert_can_manage_member", {
    p_member_id: parsed.data.memberId,
  });
  if (target.error || !target.data) {
    return { ok: false, error: target.error ? rpcError("assert_can_manage_member", target.error) : GENERIC_ERROR };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_SECRET_KEY };

  const { error } = await admin.auth.admin.updateUserById(target.data, {
    password: parsed.data.password,
  });
  if (error) {
    console.error("[resetStaffPassword]", error.code, error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  return { ok: true, data: undefined };
}
