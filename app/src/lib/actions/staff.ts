"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbFailure } from "@/lib/db-errors";
import { saveMemberSchema } from "@/lib/validations/staff";
import type { ActionResult } from "@/types/actions";
import type { Database } from "@/types/database";

/**
 * `pin` solo viene cuando se generó en esta llamada: se muestra UNA vez y no
 * se puede volver a consultar (en la base solo queda su hash). `notice` es un
 * aviso que la UI debe mostrar junto al resultado correcto.
 */
export type SaveMemberResult = { memberId: string; pin?: string; notice?: string };

const SHARED_ACCOUNT_NOTICE = "Esta persona también pertenece a otro negocio; solo se desactivó aquí.";

/** Campos nuevos de M00; el flujo legacy de staff-admin.ts se mantiene. */
export async function saveMember(restaurantId: string, input: unknown): Promise<ActionResult<SaveMemberResult>> {
  const parsed = saveMemberSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = typeof issue.path[0] === "string" && Object.hasOwn(MEMBER_FIELD_CODES, issue.path[0])
      ? issue.path[0] as MemberField : undefined;
    return memberFailure(issue.message, field ? MEMBER_FIELD_CODES[field] : "INPUT_INVALID", field);
  }
  if (!z.string().uuid().safeParse(restaurantId).success) return memberFailure("Sucursal inválida.", "RESTAURANT_INVALID");
  const values = parsed.data;
  if (!values.emailLoginEnabled) {
    return memberFailure("El acceso por correo no se puede desactivar hasta M00-T03.", "EMAIL_LOGIN_REQUIRED", "emailLoginEnabled");
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return memberFailure("Inicia sesión para gestionar miembros.", "AUTH_REQUIRED");
  const { data: actor, error: actorError } = await supabase.from("restaurant_members")
    .select("role, status").eq("restaurant_id", restaurantId).eq("user_id", user.id).maybeSingle();
  if (actorError) return { ...dbFailure(actorError, "saveMember.authorize"), code: "AUTHORIZATION_FAILED" };
  if (!actor || actor.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(actor.role)) {
    return memberFailure("Solo el dueño o administrador puede guardar miembros.", "FORBIDDEN");
  }

  const legacyRole = values.roles.includes("ADMIN") ? "ADMIN"
    : values.roles.includes("WAITER") ? "WAITER" : values.roles.includes("KITCHEN") ? "KITCHEN" : undefined;
  const allowed = await supabase.rpc("can_manage_staff_role", { p_restaurant_id: restaurantId, p_role: legacyRole ?? "WAITER" });
  if (allowed.error) return { ...dbFailure(allowed.error, "saveMember.canManageRole"), field: "roles", code: "ROLES_CHECK_FAILED" };
  if (!allowed.data) return memberFailure("No tienes permiso para asignar esos roles.", "ROLES_FORBIDDEN", "roles");

  let targetUserId: string | null = null;
  if (values.memberId) {
    const target = await supabase.rpc("assert_can_manage_member", { p_member_id: values.memberId });
    if (target.error) return { ...dbFailure(target.error, "saveMember.assertMember"), code: "MEMBER_FORBIDDEN" };
    if (!target.data || target.data === user.id) return memberFailure("No puedes modificar tu propia cuenta desde aquí.", "SELF_EDIT_FORBIDDEN");
    targetUserId = target.data;
  } else {
    if (!legacyRole) return memberFailure("Estos roles aún no tienen un equivalente para el alta actual. Se requiere definir su compatibilidad con el rol de producción.", "ROLE_COMPATIBILITY_REQUIRED", "roles");
  }
  if (values.cashRegisterIds.length) {
    const { data, error } = await supabase.from("cash_registers").select("id")
      .eq("restaurant_id", restaurantId).eq("active", true).in("id", values.cashRegisterIds);
    if (error) return { ...dbFailure(error, "saveMember.registers"), field: "cashRegisterIds", code: "CASH_REGISTER_CHECK_FAILED" };
    if (data?.length !== values.cashRegisterIds.length) return memberFailure("Las cajas asignadas deben estar activas y pertenecer a esta sucursal.", "CASH_REGISTER_INVALID", "cashRegisterIds");
  }

  // Solo tras las comprobaciones de sesión y RPC se usa la llave privilegiada.
  const admin = createAdminClient();
  if (!admin) return memberFailure("No se ha configurado el acceso del servidor para gestionar miembros.", "SERVER_CONFIGURATION");
  const fullName = values.fullName;
  let previous: Pick<Database["public"]["Tables"]["restaurant_members"]["Row"], "role" | "updated_at"> | null = null;
  let emailChanged = false;
  let sharedAccount = false;
  if (values.memberId) {
    const { data, error } = await admin.from("restaurant_members")
      .select("id, restaurant_id, user_id, role, roles, status, updated_at")
      .eq("id", values.memberId).eq("restaurant_id", restaurantId).eq("user_id", targetUserId!).maybeSingle();
    if (error) return memberWriteFailure(error, "saveMember.target");
    if (!data || data.role === "OWNER" || data.user_id === user.id) return memberFailure("El miembro no existe en esta sucursal o no tienes permiso.", "MEMBER_UNAVAILABLE");
    if (actor.role !== "OWNER" && data.roles.includes("ADMIN")) return memberFailure("Solo el dueño puede gestionar administradores.", "ROLES_FORBIDDEN", "roles");
    if (!values.generatePin) {
      const presence = await admin.from("restaurant_members").select("id")
        .eq("id", values.memberId).eq("restaurant_id", restaurantId).eq("user_id", targetUserId!)
        .not("pin_hash", "is", null).maybeSingle();
      if (presence.error) return memberWriteFailure(presence.error, "saveMember.pinPresence");
      if (!presence.data) return memberFailure("Este miembro aún no tiene PIN. Genera uno.", "PIN_REQUIRED", "pin");
    }
    if (!legacyRole && values.active && data.role === "ADMIN") return memberFailure("No se puede retirar el rol administrativo sin definir un rol de compatibilidad de producción.", "ROLE_COMPATIBILITY_REQUIRED", "roles");
    if (legacyRole && legacyRole !== data.role && JSON.stringify(values.roles) === JSON.stringify(data.roles)) {
      return memberFailure("Los roles y el rol de producción están desalineados. Revisa su compatibilidad antes de guardar.", "ROLE_COMPATIBILITY_REQUIRED", "roles");
    }
    const current = await admin.auth.admin.getUserById(targetUserId!);
    if (current.error || !current.data.user) return memberFailure("No se pudo consultar la cuenta de acceso. Intenta de nuevo.", "AUTH_LOOKUP_FAILED");
    emailChanged = current.data.user.email?.trim().toLowerCase() !== values.email;
    // La cuenta de acceso (Auth) es global: si esta persona pertenece a otro
    // negocio, correo, clave y ban afectarían también a ese negocio.
    const others = await admin.from("restaurant_members").select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId!).neq("restaurant_id", restaurantId);
    if (others.error) return memberWriteFailure(others.error, "saveMember.sharedAccount");
    sharedAccount = (others.count ?? 0) > 0;
    if (sharedAccount && (emailChanged || values.password)) {
      return memberFailure("Esta persona también pertenece a otro negocio; no se puede cambiar su correo ni su clave desde aquí.", "ACCOUNT_SHARED", values.password ? "password" : "email");
    }
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
      if (cleanup.error) return memberFailure("No se completó el alta ni su limpieza. Revisa Personal antes de reintentar.", "MEMBER_CLEANUP_FAILED");
      return linked.error ? { ...dbFailure(linked.error, "saveMember.add"), code: "MEMBER_LINK_FAILED" } : memberFailure("No se pudo vincular el miembro a la sucursal.", "MEMBER_LINK_FAILED");
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
      if (cleanup.error) { revalidatePath("/staff"); return memberFailure("El alta quedó incompleta y no se pudo retirar. Revisa Personal antes de reintentar.", "MEMBER_CLEANUP_FAILED"); }
    }
    return saveError ? memberWriteFailure(saveError, "saveMember.write") : memberFailure("El miembro cambió o ya no está disponible. Recarga Personal e intenta de nuevo.", "MEMBER_CONFLICT");
  }

  let generatedPin: string | undefined;
  if (values.generatePin) {
    let pinError: { code?: string } | null;
    try {
      const result = await supabase.rpc("generate_member_pin", { p_member_id: memberId });
      pinError = result.error;
      if (!result.error) generatedPin = typeof result.data === "string" && /^\d{4}$/.test(result.data) ? result.data : undefined;
      if (!result.error && !generatedPin) pinError = {};
    } catch {
      pinError = {};
    }
    if (pinError) {
      if (createdUserId) {
        const cleanup = await admin.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) { revalidatePath("/staff"); return memberFailure("El alta quedó sin PIN y no se pudo retirar. Revisa Personal antes de reintentar.", "MEMBER_CLEANUP_FAILED"); }
      } else revalidatePath("/staff");
      return memberPinFailure(pinError);
    }
  }

  if (sharedAccount) {
    // Cuenta compartida: solo cambió el miembro local; no se toca Auth ni el perfil global.
  } else if (!createdUserId) {
    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", targetUserId!).select("id").single();
    if (profileError) { revalidatePath("/staff"); return memberFailure("Se guardaron los permisos, pero no el nombre. Recarga Personal y reintenta.", "FULL_NAME_SAVE_FAILED", "fullName"); }
    const authUpdate = await admin.auth.admin.updateUserById(targetUserId!, {
      user_metadata: { full_name: fullName }, ...(emailChanged ? { email: values.email } : {}),
      ...(values.password ? { password: values.password } : {}),
      ban_duration: values.active ? "none" : "876000h",
    });
    if (authUpdate.error) { revalidatePath("/staff"); return memberAuthFailure(authUpdate.error, "Se guardó el miembro, pero no sus credenciales. Recarga Personal y revisa el acceso."); }
  } else if (!values.active) {
    const banned = await admin.auth.admin.updateUserById(targetUserId!, { ban_duration: "876000h" });
    if (banned.error) { revalidatePath("/staff"); return memberFailure("Se guardó el miembro inactivo, pero no se pudo bloquear su cuenta de acceso.", "AUTH_UPDATE_FAILED"); }
  }
  revalidatePath("/staff");
  return { ok: true, data: {
    memberId,
    ...(generatedPin ? { pin: generatedPin } : {}),
    ...(sharedAccount && !values.active ? { notice: SHARED_ACCOUNT_NOTICE } : {}),
  } };
}

const MEMBER_FIELD_CODES = {
  fullName: "FULL_NAME_INVALID",
  roles: "ROLES_INVALID",
  cashRegisterIds: "CASH_REGISTER_INVALID",
  email: "EMAIL_INVALID",
  password: "PASSWORD_INVALID",
  pin: "PIN_INVALID",
  generatePin: "PIN_INVALID",
  emailLoginEnabled: "EMAIL_LOGIN_INVALID",
} as const;
type MemberField = keyof typeof MEMBER_FIELD_CODES;
type MemberFailure = Extract<ActionResult<never>, { ok: false }>;

function memberFailure(error: string, code: string, field?: MemberField): MemberFailure {
  return { ok: false, error, code, ...(field ? { field } : {}) };
}

function memberWriteFailure(error: { message: string; code?: string }, context: string): MemberFailure {
  // No registrar mensajes SQL que pudieran incluir el hash del PIN.
  return { ...dbFailure({ code: error.code, message: "Error al guardar datos del miembro" }, context), code: "MEMBER_SAVE_FAILED" };
}

function memberAuthFailure(error: { code?: string } | null, fallback = "No se pudo guardar la cuenta de acceso. Intenta de nuevo."): MemberFailure {
  if (["email_exists", "email_already_exists", "user_already_exists"].includes(error?.code ?? "")) {
    return memberFailure("Ese correo ya tiene una cuenta. Usa un correo diferente.", "EMAIL_EXISTS", "email");
  }
  if (error?.code === "email_address_invalid") return memberFailure("Correo inválido", "EMAIL_INVALID", "email");
  if (error?.code === "weak_password") return memberFailure("Elige una clave más segura.", "PASSWORD_WEAK", "password");
  return memberFailure(fallback, "AUTH_SAVE_FAILED");
}

function memberPinFailure(error: { code?: string }): MemberFailure {
  const fallback = error.code === "42501" ? "No tienes permiso para cambiar el PIN de este miembro."
    : "No se pudo generar el PIN. Revisa el miembro antes de reintentar.";
  // 22023 tiene una traducción genérica de catálogo en db-errors; aquí el mensaje propio del PIN prevalece.
  const failure = dbFailure({ code: error.code, message: "Error al generar el PIN del miembro" }, "generate_member_pin", fallback);
  return {
    ...(error.code === "22023" ? { ok: false as const, error: fallback } : failure),
    field: "pin",
    code: error.code === "42501" ? "PIN_FORBIDDEN" : "PIN_SAVE_FAILED",
  };
}
