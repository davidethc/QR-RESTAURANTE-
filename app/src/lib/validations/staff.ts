import { z } from "zod";

export const STAFF_ROLES = ["ADMIN", "WAITER", "KITCHEN"] as const;

const password = z
  .string()
  .min(8, "La clave debe tener al menos 8 caracteres")
  .max(72, "La clave es demasiado larga");

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe el nombre de la persona").max(100),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  role: z.enum(STAFF_ROLES, "Elige un rol"),
  password,
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(STAFF_ROLES, "Elige un rol"),
  active: z.boolean(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const resetPasswordSchema = z.object({
  memberId: z.uuid(),
  password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Clave temporal fácil de dictar: sin 0/O ni 1/l/I. */
export function generateTempPassword(length = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}


export const MEMBER_ROLES = ["ADMIN", "MEMBERS_ADMIN", "BRANCH_MANAGER", "MENU_MANAGER", "CASHIER", "WAITER", "KITCHEN"] as const;
export type MemberRole = typeof MEMBER_ROLES[number];
const memberId = z.string({ error: "Identificador inválido" }).uuid("Identificador inválido");
const pinSchema = z.string({ error: "El PIN debe tener 4 dígitos" }).regex(/^\d{4}$/, "El PIN debe tener 4 dígitos");

export const saveMemberSchema = z.object({
  memberId: memberId.optional(),
  fullName: z.string({ error: "Escribe el nombre de la persona" }).trim().min(2, "Escribe el nombre de la persona").max(100, "Usa hasta 100 caracteres"),
  roles: z.array(z.enum(MEMBER_ROLES, "Elige roles válidos"), { error: "Elige roles válidos" }),
  active: z.boolean({ error: "Indica si el miembro está activo" }),
  emailLoginEnabled: z.boolean({ error: "Indica si permite acceso con correo" }),
  cashRegisterIds: z.unknown().optional(),
  email: z.unknown().optional(),
  password: z.unknown().optional(),
  pin: z.unknown().optional(),
}, { error: "Ingresa los datos del miembro" }).transform((input, ctx) => {
  const roles = [...new Set(input.roles)];
  let cashRegisterIds: string[] = [];
  let email: string | undefined;
  let memberPassword: string | undefined;
  let pin: string | undefined;
  if (roles.includes("CASHIER")) {
    const parsed = z.array(memberId, { error: "Selecciona las cajas asignadas" }).min(1, "Asigna al menos una caja al cajero").safeParse(input.cashRegisterIds ?? []);
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: ["cashRegisterIds", ...issue.path], message: issue.message });
    else cashRegisterIds = [...new Set(parsed.data)];
  }
  if (input.emailLoginEnabled) {
    const parsed = z.string({ error: "Escribe el correo de acceso" }).trim().toLowerCase().email("Correo inválido").safeParse(input.email);
    if (!parsed.success) ctx.addIssue({ code: "custom", path: ["email"], message: parsed.error.issues[0].message });
    else email = parsed.data;
    if (!input.memberId || (input.password !== undefined && input.password !== "")) {
      const parsedPassword = password.safeParse(input.password);
      if (!parsedPassword.success) ctx.addIssue({ code: "custom", path: ["password"], message: "La clave debe tener entre 8 y 72 caracteres" });
      else memberPassword = parsedPassword.data;
    }
  }
  if (!input.memberId || (input.pin !== undefined && input.pin !== "")) {
    const parsed = pinSchema.safeParse(input.pin);
    if (!parsed.success) ctx.addIssue({ code: "custom", path: ["pin"], message: parsed.error.issues[0].message });
    else pin = parsed.data;
  }
  if (!roles.length && input.active) {
    ctx.addIssue({ code: "custom", path: ["roles"], message: "Un miembro sin roles debe quedar inactivo durante la transición" });
  }
  return { memberId: input.memberId, fullName: input.fullName, roles, active: input.active,
    emailLoginEnabled: input.emailLoginEnabled, cashRegisterIds, email, password: memberPassword, pin };
});
export type SaveMemberInput = z.output<typeof saveMemberSchema>;
