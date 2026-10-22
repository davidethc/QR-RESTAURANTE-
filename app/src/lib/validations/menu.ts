import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  description: z.string().trim().max(300).optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

const legacyProductSchema = z.object({
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

export const catalogIdSchema = z.string().uuid("Identificador inválido");
const moneySchema = z.number({ error: "Ingresa un precio válido" })
  .min(0, "El precio no puede ser negativo")
  .max(99999999.99, "El precio es demasiado alto")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Usa hasta dos decimales");
const positionSchema = z.number().int().min(0).max(2147483647).optional();

export const productVariantSchema = z.object({
  id: catalogIdSchema.optional(),
  name: z.string().trim().max(80, "Usa hasta 80 caracteres"),
  price: moneySchema,
  position: positionSchema,
});

export const productVariantsSchema = z.array(productVariantSchema)
  .min(1, "El producto debe tener al menos una variante")
  .superRefine((variants, ctx) => {
    variants.forEach((variant, index) => {
      if (variants.length === 1 && variant.name !== "") {
        ctx.addIssue({ code: "custom", path: [index, "name"], message: "Con un solo precio, la variante no lleva nombre" });
      }
      if (variants.length > 1 && !variant.name) {
        ctx.addIssue({ code: "custom", path: [index, "name"], message: "Nombra cada variante cuando hay varios precios" });
      }
      if (variant.id && variants.slice(0, index).some((other) => other.id === variant.id)) {
        ctx.addIssue({ code: "custom", path: [index, "id"], message: "Una variante no puede repetirse" });
      }
    });
  });

export const productSchema = legacyProductSchema.extend({
  variants: productVariantsSchema.optional(),
}).superRefine((product, ctx) => {
  if (product.variants?.length === 1 && product.variants[0].price !== product.price) {
    ctx.addIssue({ code: "custom", path: ["variants", 0, "price"], message: "El único precio debe ser igual al precio del producto" });
  }
});

export const modifierOptionSchema = z.object({
  id: catalogIdSchema.optional(),
  name: z.string({ error: "El nombre es obligatorio" }).trim().min(1, "El nombre es obligatorio"),
  price: moneySchema,
  position: positionSchema,
});

export const modifierGroupFieldsSchema = z.object({
  name: z.string({ error: "El nombre es obligatorio" }).trim().min(1, "El nombre es obligatorio"),
  internal_label: z.string().trim().nullable().optional(),
  min_select: z.number().int().min(0, "El mínimo no puede ser negativo"),
  max_select: z.number().int().min(1, "El máximo debe ser al menos uno"),
  allow_repeat: z.boolean(),
});

export const modifierGroupSchema = modifierGroupFieldsSchema.extend({
  options: z.array(modifierOptionSchema).min(1, "Agrega al menos una opción"),
}).superRefine((group, ctx) => {
  if (group.min_select > group.max_select) {
    ctx.addIssue({ code: "custom", path: ["min_select"], message: "El mínimo no puede superar el máximo" });
  }
  if (group.max_select > group.options.length) {
    ctx.addIssue({ code: "custom", path: ["max_select"], message: "El máximo no puede superar la cantidad de opciones" });
  }
  group.options.forEach((option, index) => {
    if (option.id && group.options.slice(0, index).some((other) => other.id === option.id)) {
      ctx.addIssue({ code: "custom", path: ["options", index, "id"], message: "Una opción no puede repetirse" });
    }
  });
});

export const productModifierGroupSchema = z.object({
  product_id: catalogIdSchema,
  group_id: catalogIdSchema,
  position: positionSchema,
});

export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

export const setItemAvailabilitySchema = z.object({
  itemType: z.enum(["variant", "modifier_option"]),
  itemId: z.string().uuid("Ítem inválido"),
  available: z.boolean(),
});
