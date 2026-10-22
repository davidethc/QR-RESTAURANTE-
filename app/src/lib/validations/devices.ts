import { z } from "zod";

export const deviceNameSchema = z
  .string()
  .trim()
  .min(2, "El nombre debe tener al menos 2 caracteres.")
  .max(60, "El nombre admite hasta 60 caracteres.");

export const deviceLinkTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "El enlace no es válido o ya venció.");

export const activateDeviceSchema = z.object({
  token: deviceLinkTokenSchema,
  name: deviceNameSchema,
});

export const pinSchema = z.string().regex(/^[0-9]{4}$/, "El PIN tiene 4 dígitos.");

export const createDeviceLinkSchema = z.object({
  restaurantId: z.string().uuid("Sucursal inválida."),
  name: deviceNameSchema.optional(),
});

export const deviceIdSchema = z.object({ deviceId: z.string().uuid("Dispositivo inválido.") });

export const renameDeviceSchema = z.object({
  restaurantId: z.string().uuid("Sucursal inválida."),
  deviceId: z.string().uuid("Dispositivo inválido."),
  name: deviceNameSchema,
});

export interface DeviceRow {
  id: string;
  name: string | null;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  linked_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  link_expires_at: string | null;
}
