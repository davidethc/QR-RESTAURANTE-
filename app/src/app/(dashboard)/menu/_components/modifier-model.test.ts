import { describe, expect, it } from "vitest";
import { filterModifiers, modifierDraft, validateModifier, type ModifierGroup } from "./modifier-model";

const group = {
  id: "b02f641e-585f-4d16-9430-a59fca6a1091", name: "Elige tu salsa", internal_label: "Salsas de cocina",
  min_select: 1, max_select: 2, allow_repeat: true, usage_count: 3,
  modifier_options: [
    { id: "a02f641e-585f-4d16-9430-a59fca6a1091", name: "Queso", price: 0.5, position: 1 },
    { id: "c02f641e-585f-4d16-9430-a59fca6a1091", name: "Ají", price: 0, position: 0 },
  ],
} as ModifierGroup;

describe("Borradores de personalizaciones", () => {
  it("duplica con orden y precios, sin IDs persistidos ni vínculos", () => {
    const draft = modifierDraft(group, true);
    expect(draft.name).toBe("Elige tu salsa (copia)");
    expect(draft.options.map((option) => [option.name, option.price, option.id])).toEqual([["Ají", "0", undefined], ["Queso", "0.5", undefined]]);
    expect(draft).not.toHaveProperty("usage_count");
    expect(draft).not.toHaveProperty("product_modifier_groups");
  });
  it("conserva IDs al editar sin mutar las relaciones originales", () => {
    const draft = modifierDraft(group);
    expect(draft.options[0].id).toBe(group.modifier_options[1].id);
    expect(group.modifier_options[0].name).toBe("Queso");
  });
  it("no transforma campos numéricos vacíos en cero", () => {
    const draft = modifierDraft(group);
    draft.options[0].price = "";
    draft.min_select = "";
    const result = validateModifier(draft);
    expect(result.parsed.success).toBe(false);
    expect(result.errors["options.0.price"]).toBe("Completa este campo.");
    expect(result.errors.min_select).toBe("Completa este campo.");
  });
  it("acepta coma decimal y cero, rechaza descuentos y precisión adicional junto a la fila", () => {
    const draft = modifierDraft(group);
    draft.options[1].price = "0,50";
    expect(validateModifier(draft).parsed.success).toBe(true);
    draft.options[1].price = "-1";
    expect(validateModifier(draft).errors["options.1.price"]).toBeTruthy();
    draft.options[1].price = "0.001";
    expect(validateModifier(draft).errors["options.1.price"]).toBe("Usa hasta dos decimales");
  });
  it("con repetición el máximo puede superar las opciones; sin repetición no", () => {
    const draft = modifierDraft(group);
    draft.max_select = "3";
    draft.allow_repeat = true;
    expect(validateModifier(draft).parsed.success).toBe(true);
    draft.allow_repeat = false;
    expect(validateModifier(draft).errors.max_select).toBe("El máximo no puede superar la cantidad de opciones");
  });
  it("muestra la relación inválida también junto al máximo", () => {
    const draft = modifierDraft(group);
    draft.min_select = "3";
    expect(validateModifier(draft).errors.max_select).toBe("El máximo debe ser igual o mayor que el mínimo.");
  });
  it("filtra por uso y busca en nombre o etiqueta sin tildes", () => {
    const unused = { ...group, id: "unused", name: "Elige el punto", internal_label: "Preparación", usage_count: 0 };
    expect(filterModifiers([group, unused], "preparacion", true)).toEqual([unused]);
    expect(filterModifiers([group, unused], "cocina", true)).toEqual([]);
    expect(filterModifiers([group, unused], "SALSA", false)).toEqual([group]);
  });
});
