"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbFailure } from "@/lib/db-errors";
import { saveMemberSchema } from "@/lib/validations/staff";
import type { ActionResult } from "@/types/actions";
import type { Database } from "@/types/database";
import { getStaffOrders, getWaiterCalls } from "@/lib/queries/staff";
import type { OrderStatus, CallStatus } from "@/config/constants";

/**
 * `queries/staff.ts` está pensado para Server Components (usa cookies()
 * directamente). Estas dos envolturas existen solo porque el panel del
 * mesero necesita volver a pedir los datos desde el cliente cuando
 * Realtime avisa un cambio — son lecturas, no mutaciones, pero deben
 * vivir en un archivo "use server" para poder llamarse así.
 */
export async function fetchStaffOrders(
  restaurantId: string,
  statuses?: OrderStatus[]
) {
  return getStaffOrders(restaurantId, statuses);
}

export async function fetchWaiterCalls(
  restaurantId: string,
  statuses?: CallStatus[]
) {
  return getWaiterCalls(restaurantId, statuses);
}

/** Campos nuevos de M00; el flujo legacy de staff-admin.ts se mantiene. */
export async function saveMember(restaurantId: string, input: unknown): Promise<ActionResult<string>> {
  const parsed = saveMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!z.string().uuid().safeParse(restaurantId).success) return { ok: false, error: "Sucursal inválida." };
  const values = parsed.data;
  if (!values.emailLoginEnabled) {
    return { ok: false, error: "El acceso por correo no se puede desactivar hasta M00-T03." };
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Inicia sesión para gestionar miembros." };
  const { data: actor, error: actorError } = await supabase.from("restaurant_members")
    .select("role, status").eq("restaurant_id", restaurantId).eq("user_id", user.id).maybeSingle();
  if (actorError) return dbFailure(actorError, "saveMember.authorize");
  if (!actor || actor.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(actor.role)) {
    return { ok: false, error: "Solo el dueño o administrador puede guardar miembros." };
  }

  const legacyRole = values.roles.includes("ADMIN") ? "ADMIN"
    : values.roles.includes("WAITER") ? "WAITER" : values.roles.includes("KITCHEN") ? "KITCHEN" : undefined;
  const allowed = await supabase.rpc("can_manage_staff_role", { p_restaurant_id: restaurantId, p_role: legacyRole ?? "WAITER" });
  if (allowed.error) return dbFailure(allowed.error, "saveMember.canManageRole");
  if (!allowed.data) return { ok: false, error: "No tienes permiso para asignar esos roles." };

  let targetUserId: string | null = null;
  if (values.memberId) {
    const target = await supabase.rpc("assert_can_manage_member", { p_member_id: values.memberId });
    if (target.error) return dbFailure(target.error, "saveMember.assertMember");
    if (!target.data || target.data === user.id) return { ok: false, error: "No puedes modificar tu propia cuenta desde aquí." };
    targetUserId = target.data;
  } else {
    if (!legacyRole) return { ok: false, error: "Estos roles aún no tienen un equivalente para el alta actual. Se requiere definir su compatibilidad con el rol de producción." };
  }
  if (values.cashRegisterIds.length) {
    const { data, error } = await supabase.from("cash_registers").select("id")
      .eq("restaurant_id", restaurantId).eq("active", true).in("id", values.cashRegisterIds);
    if (error) return dbFailure(error, "saveMember.registers");
    if (data?.length !== values.cashRegisterIds.length) return { ok: false, error: "Las cajas asignadas deben estar activas y pertenecer a esta sucursal." };
  }

  // Solo tras las comprobaciones de sesión y RPC se usa la llave privilegiada.
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "No se ha configurado el acceso del servidor para gestionar miembros." };
  const fullName = values.fullName;
  let previous: Pick<Database["public"]["Tables"]["restaurant_members"]["Row"], "role" | "updated_at"> | null = null;
  let emailChanged = false;
  if (values.memberId) {
    const { data, error } = await admin.from("restaurant_members")
      .select("id, restaurant_id, user_id, role, roles, status, updated_at")
      .eq("id", values.memberId).eq("restaurant_id", restaurantId).eq("user_id", targetUserId!).maybeSingle();
    if (error) return memberWriteFailure(error, "saveMember.target");
    if (!data || data.role === "OWNER" || data.user_id === user.id) return { ok: false, error: "El miembro no existe en esta sucursal o no tienes permiso." };
    if (actor.role !== "OWNER" && data.roles.includes("ADMIN")) return { ok: false, error: "Solo el dueño puede gestionar administradores." };
    if (!values.pin) {
      const presence = await admin.from("restaurant_members").select("id")
        .eq("id", values.memberId).eq("restaurant_id", restaurantId).eq("user_id", targetUserId!)
        .not("pin_hash", "is", null).maybeSingle();
      if (presence.error) return memberWriteFailure(presence.error, "saveMember.pinPresence");
      if (!presence.data) return { ok: false, error: "El PIN debe tener 4 dígitos" };
    }
    if (!legacyRole && values.active && data.role === "ADMIN") return { ok: false, error: "No se puede retirar el rol administrativo sin definir un rol de compatibilidad de producción." };
    if (legacyRole && legacyRole !== data.role && JSON.stringify(values.roles) === JSON.stringify(data.roles)) {
      return { ok: false, error: "Los roles y el rol de producción están desalineados. Revisa su compatibilidad antes de guardar." };
    }
    const current = await admin.auth.admin.getUserById(targetUserId!);
    if (current.error || !current.data.user) return { ok: false, error: "No se pudo consultar la cuenta de acceso. Intenta de nuevo." };
    emailChanged = current.data.user.email?.trim().toLowerCase() !== values.email;
    previous = data;
  }

  let memberId = values.memberId;
  let createdUserId: string | undefined;
  if (!memberId) {
    const created = await admin.auth.admin.createUser({ email: values.email!, password: values.password!,
      email_confirm: true, user_metadata: { full_name: fullName } });
    if (created.error || !created.data.user) return memberAuthFailure(created.error);
    targetUserId = created.data.user.id;
    createdUserId = targetUserId;
    const linked = await supabase.rpc("add_staff_member", {
      p_restaurant_id: restaurantId, p_user_id: targetUserId, p_role: legacyRole!, p_full_name: fullName,
    });
    if (linked.error || !linked.data) {
      const cleanup = await admin.auth.admin.deleteUser(createdUserId);
      if (cleanup.error) return { ok: false, error: "No se completó el alta ni su limpieza. Revisa Personal antes de reintentar." };
      return linked.error ? dbFailure(linked.error, "saveMember.add") : { ok: false, error: "No se pudo vincular el miembro a la sucursal." };
    }
    memberId = linked.data;
  }

  const fields: Database["public"]["Tables"]["restaurant_members"]["Update"] = {
    roles: values.roles, cash_register_ids: values.cashRegisterIds, email_login_enabled: values.emailLoginEnabled,
    status: values.active ? "ACTIVE" : "INACTIVE", ...(legacyRole ? { role: legacyRole } : {}),
  };
  let write = admin.from("restaurant_members").update(fields).eq("id", memberId)
    .eq("restaurant_id", restaurantId).eq("user_id", targetUserId!);
  if (previous) write = write.eq("updated_at", previous.updated_at).eq("role", previous.role);
  const { data: saved, error: saveError } = await write.select("id").maybeSingle();
  if (saveError || !saved) {
    if (createdUserId) {
      const cleanup = await admin.auth.admin.deleteUser(createdUserId);
      if (cleanup.error) { revalidatePath("/staff"); return { ok: false, error: "El alta quedó incompleta y no se pudo retirar. Revisa Personal antes de reintentar." }; }
    }
    return saveError ? memberWriteFailure(saveError, "saveMember.write") : { ok: false, error: "El miembro cambió o ya no está disponible. Recarga Personal e intenta de nuevo." };
  }

  if (values.pin) {
    let pinError: { code?: string } | null;
    try {
      const result = await supabase.rpc("set_member_pin", { p_member_id: memberId, p_pin: values.pin });
      pinError = result.error;
    } catch {
      pinError = {};
    }
    if (pinError) {
      if (createdUserId) {
        const cleanup = await admin.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) { revalidatePath("/staff"); return { ok: false, error: "El alta quedó sin PIN y no se pudo retirar. Revisa Personal antes de reintentar." }; }
      } else revalidatePath("/staff");
      return memberPinFailure(pinError);
    }
  }

  if (!createdUserId) {
    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", targetUserId!).select("id").single();
    if (profileError) { revalidatePath("/staff"); return { ok: false, error: "Se guardaron los permisos, pero no el nombre. Recarga Personal y reintenta." }; }
    const authUpdate = await admin.auth.admin.updateUserById(targetUserId!, {
      user_metadata: { full_name: fullName }, ...(emailChanged ? { email: values.email } : {}),
      ...(values.password ? { password: values.password } : {}),
      ban_duration: values.active ? "none" : "876000h",
    });
    if (authUpdate.error) { revalidatePath("/staff"); return memberAuthFailure(authUpdate.error, "Se guardó el miembro, pero no sus credenciales. Recarga Personal y revisa el acceso."); }
  } else if (!values.active) {
    const banned = await admin.auth.admin.updateUserById(targetUserId!, { ban_duration: "876000h" });
    if (banned.error) { revalidatePath("/staff"); return { ok: false, error: "Se guardó el miembro inactivo, pero no se pudo bloquear su cuenta de acceso." }; }
  }
  revalidatePath("/staff");
  return { ok: true, data: memberId };
}

function memberWriteFailure(error: { message: string; code?: string }, context: string) {
  // No registrar mensajes SQL que pudieran incluir el hash del PIN.
  return dbFailure({ code: error.code, message: "Error al guardar datos del miembro" }, context);
}

function memberAuthFailure(error: { code?: string } | null, fallback = "No se pudo guardar la cuenta de acceso. Intenta de nuevo."): { ok: false; error: string } {
  if (error?.code === "email_exists" || error?.code === "email_already_exists") return { ok: false, error: "Ese correo ya tiene una cuenta. Usa un correo diferente." };
  return { ok: false, error: fallback };
}

function memberPinFailure(error: { code?: string }) {
  const fallback = error.code === "42501" ? "No tienes permiso para cambiar el PIN de este miembro."
    : error.code === "22023" ? "El PIN debe tener 4 dígitos"
    : "No se pudo guardar el PIN. Revisa el miembro antes de reintentar.";
  return dbFailure({ code: error.code, message: "Error al asignar el PIN del miembro" }, "set_member_pin", fallback);
}
