import { z } from "zod";

export const restaurantSettingsSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  description: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
});
export type RestaurantSettingsInput = z.infer<typeof restaurantSettingsSchema>;

export const billingSettingsSchema = z.object({
  billingEnabled: z.boolean(),
  maxWaiterDiscountPct: z.coerce
    .number("Escribe un número")
    .min(0, "Mínimo 0 %")
    .max(100, "Máximo 100 %"),
  businessDayCutoff: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)")
    .refine((v) => v <= "12:00", "El corte debe ser entre 00:00 y 12:00"),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;
