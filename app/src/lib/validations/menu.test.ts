import { describe, expect, it } from "vitest";
import { categorySchema, productSchema, productVariantsSchema, modifierGroupSchema, modifierOptionSchema, productModifierGroupSchema } from "./menu";

const product = { name: "Café", price: 2, available: true, featured: false };
const variant = { name: "", price: 2 };
const option = { name: "Leche", price: 0 };
const group = { name: "Elige leche", min_select: 0, max_select: 1, allow_repeat: false, options: [option] };
const id = "11111111-1111-4111-8111-111111111111";

describe("catálogo: compatibilidad", () => {
  it("mantiene el producto legacy sin variantes", () => {
    expect(productSchema.parse(product)).toEqual(product);
  });
  it("mantiene categoría y recorta nombre y descripción", () => {
    expect(categorySchema.parse({ name: " Bebidas ", description: " Calientes " })).toEqual({ name: "Bebidas", description: "Calientes" });
    expect(categorySchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("variantes", () => {
  it("exige al menos una si se envían variantes", () => {
    expect(productSchema.safeParse({ ...product, variants: [] }).success).toBe(false);
    expect(productVariantsSchema.safeParse([]).success).toBe(false);
  });
  it("un solo precio no lleva nombre y debe coincidir con el producto", () => {
    expect(productSchema.safeParse({ ...product, variants: [variant] }).success).toBe(true);
    expect(productSchema.safeParse({ ...product, variants: [{ ...variant, name: "Grande" }] }).success).toBe(false);
    const result = productSchema.safeParse({ ...product, variants: [{ ...variant, price: 3 }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["variants", 0, "price"]);
  });
  it("permite múltiples precios nombrados", () => {
    expect(productSchema.safeParse({ ...product, variants: [{ name: "Pequeño", price: 2 }, { name: "Grande", price: 3 }] }).success).toBe(true);
    expect(productVariantsSchema.safeParse([variant, { name: "Grande", price: 3 }]).success).toBe(false);
  });
  it("no requiere position para conservar el contrato del formulario", () => {
    const result = productSchema.parse({ ...product, variants: [variant] });
    expect(result.variants?.[0]).toEqual(variant);
  });
  it("rechaza ids duplicados y precios negativos, no finitos, fuera de rango o con más de dos decimales", () => {
    expect(productVariantsSchema.safeParse([{ id, name: "A", price: 1 }, { id, name: "B", price: 2 }]).success).toBe(false);
    for (const price of [-1, Infinity, NaN, 100000000, 1.234]) expect(productVariantsSchema.safeParse([{ ...variant, price }]).success).toBe(false);
    expect(productVariantsSchema.safeParse([{ ...variant, price: 0.29 }]).success).toBe(true);
  });
});

describe("personalizaciones", () => {
  it("permite opcional o requerido y precio cero", () => {
    expect(modifierGroupSchema.safeParse(group).success).toBe(true);
    expect(modifierGroupSchema.safeParse({ ...group, min_select: 1 }).success).toBe(true);
  });
  it("exige mínimo <= máximo <= número de opciones", () => {
    for (const invalid of [{ min_select: 2 }, { max_select: 2 }, { min_select: -1 }, { max_select: 0 }, { min_select: 0.5 }, { options: [] }]) {
      expect(modifierGroupSchema.safeParse({ ...group, ...invalid }).success).toBe(false);
    }
  });
  it("el máximo puede superar las opciones solo si permite repetición", () => {
    const one = { ...group, options: [option], min_select: 0, max_select: 3 };
    expect(modifierGroupSchema.safeParse({ ...one, allow_repeat: true }).success).toBe(true);
    const r = modifierGroupSchema.safeParse({ ...one, allow_repeat: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "max_select")).toBe(true);
  });
  it("rechaza precios negativos, nombres vacíos e ids repetidos", () => {
    expect(modifierOptionSchema.safeParse({ ...option, price: -0.01 }).success).toBe(false);
    expect(modifierOptionSchema.safeParse({ ...option, name: " " }).success).toBe(false);
    expect(modifierGroupSchema.safeParse({ ...group, options: [{ ...option, id }, { ...option, id }] }).success).toBe(false);
  });
  it("descarta columnas de padre y trazabilidad del payload", () => {
    expect(modifierOptionSchema.parse({ ...option, group_id: id, legacy_value_id: id })).toEqual(option);
    expect(modifierGroupSchema.parse({ ...group, restaurant_id: id, legacy_option_id: id })).not.toHaveProperty("restaurant_id");
  });
  it("valida el vínculo y su posición", () => {
    expect(productModifierGroupSchema.safeParse({ product_id: id, group_id: id, position: 0 }).success).toBe(true);
    expect(productModifierGroupSchema.safeParse({ product_id: "otro", group_id: id }).success).toBe(false);
    expect(productModifierGroupSchema.safeParse({ product_id: id, group_id: id, position: -1 }).success).toBe(false);
  });
});
