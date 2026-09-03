import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  description: z.string().trim().max(300).optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  description: z.string().trim().max(500).optional(),
  price: z
    .number({ error: "Ingresa un precio válido" })
    .min(0, "El precio no puede ser negativo"),
  category_id: z.string().trim().optional(),
  available: z.boolean(),
  featured: z.boolean(),
  paired_drink_id: z.string().trim().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;
