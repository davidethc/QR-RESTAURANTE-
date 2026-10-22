import { z } from "zod";

export const ticketIdSchema = z.object({ ticketId: z.string().uuid("Comanda inválida") });

export const kdsSettingsSchema = z
  .object({
    restaurantId: z.string().uuid(),
    enabled: z.boolean().optional(),
    warnMinutes: z.number().int().min(1).max(240).optional(),
    alertMinutes: z.number().int().min(1).max(240).optional(),
  })
  .refine(
    (v) =>
      v.warnMinutes === undefined || v.alertMinutes === undefined || v.alertMinutes > v.warnMinutes,
    { message: "El aviso rojo debe ser mayor que el amarillo", path: ["alertMinutes"] }
  );

export const kitchenTicketsQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(["pending", "completed"]).default("pending"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type KitchenTicketsQuery = z.input<typeof kitchenTicketsQuerySchema>;
