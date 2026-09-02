import { z } from "zod";

export const restaurantSettingsSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  description: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
});
export type RestaurantSettingsInput = z.infer<typeof restaurantSettingsSchema>;
