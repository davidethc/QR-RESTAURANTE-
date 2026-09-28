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
