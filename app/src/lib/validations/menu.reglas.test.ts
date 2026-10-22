import { describe, expect, it } from "vitest";
import {
  modifierGroupSchema,
  modifierOptionSchema,
  productSchema,
  productVariantsSchema,
} from "./menu";

const product = { name: "Café", price: 2, available: true, featured: false };
const option = { name: "Leche", price: 0 };
const group = { name: "Elige leche", min_select: 1, max_select: 1, allow_repeat: false, options: [option] };

type Issue = { message: string; path: PropertyKey[] };
type ParseResult = { success: boolean; error?: { issues: Issue[] } };

function issuesOf(result: ParseResult): Issue[] {
  if (result.success) throw new Error("Se esperaba que el esquema rechazara los datos");
  return result.error!.issues;
}

function firstIssue(result: ParseResult): Issue {
  return issuesOf(result)[0];
}

describe("(a) variantes del producto", () => {
  it("exige al menos una variante con el mensaje de negocio", () => {
    expect(firstIssue(productVariantsSchema.safeParse([]))).toMatchObject({
      message: "El producto debe tener al menos una variante",
      path: [],
    });
    expect(firstIssue(productSchema.safeParse({ ...product, variants: [] }))).toMatchObject({
      message: "El producto debe tener al menos una variante",
      path: ["variants"],
    });
  });

  it("acepta el precio mínimo de 0 y el máximo con dos decimales", () => {
    expect(productVariantsSchema.safeParse([{ name: "", price: 0 }]).success).toBe(true);
    expect(productVariantsSchema.safeParse([{ name: "", price: 99999999.99 }]).success).toBe(true);
  });

  it.each([-0.01, -1, -99999999.99])("rechaza el precio negativo %s con su mensaje", (price) => {
    expect(firstIssue(productVariantsSchema.safeParse([{ name: "", price }]))).toMatchObject({
      message: "El precio no puede ser negativo",
      path: [0, "price"],
    });
  });

  it("rechaza precios fuera de rango o con más de dos decimales con el mensaje correcto", () => {
    expect(firstIssue(productVariantsSchema.safeParse([{ name: "", price: 100000000 }]))).toMatchObject({
      message: "El precio es demasiado alto",
      path: [0, "price"],
    });
    expect(firstIssue(productVariantsSchema.safeParse([{ name: "", price: 1.234 }]))).toMatchObject({
      message: "Usa hasta dos decimales",
      path: [0, "price"],
    });
  });

  it("exige nombre solo cuando hay varios precios y lo prohíbe con uno solo", () => {
    expect(firstIssue(productVariantsSchema.safeParse([{ name: "Grande", price: 2 }]))).toMatchObject({
      message: "Con un solo precio, la variante no lleva nombre",
      path: [0, "name"],
    });
    expect(firstIssue(productVariantsSchema.safeParse([{ name: "", price: 2 }, { name: "Grande", price: 3 }]))).toMatchObject({
      message: "Nombra cada variante cuando hay varios precios",
      path: [0, "name"],
    });
  });
});

describe("(b) reglas del grupo de personalización", () => {
  it("min_select 0 significa opcional y min_select 1 obligatorio", () => {
    expect(modifierGroupSchema.parse({ ...group, min_select: 0 }).min_select).toBe(0);
    expect(modifierGroupSchema.parse(group).min_select).toBe(1);
  });

  it("rechaza min_select mayor que max_select con el mensaje correcto", () => {
    expect(firstIssue(modifierGroupSchema.safeParse({ ...group, min_select: 2, max_select: 1 }))).toMatchObject({
      message: "El mínimo no puede superar el máximo",
      path: ["min_select"],
    });
  });

  it("rechaza max_select mayor que la cantidad de opciones con el mensaje correcto", () => {
    expect(firstIssue(modifierGroupSchema.safeParse({ ...group, min_select: 0, max_select: 2 }))).toMatchObject({
      message: "El máximo no puede superar la cantidad de opciones",
      path: ["max_select"],
    });
  });

  it("acepta min_select 0 y max_select igual al número de opciones", () => {
    expect(modifierGroupSchema.safeParse({ ...group, min_select: 0, max_select: 1 }).success).toBe(true);
    expect(
      modifierGroupSchema.safeParse({
        ...group,
        min_select: 0,
        max_select: 2,
        options: [option, { name: "Soya", price: 0.5 }],
      }).success,
    ).toBe(true);
  });

  it("rechaza mínimos negativos y máximos menores que uno con su mensaje", () => {
    expect(firstIssue(modifierGroupSchema.safeParse({ ...group, min_select: -1 }))).toMatchObject({
      message: "El mínimo no puede ser negativo",
      path: ["min_select"],
    });
    expect(firstIssue(modifierGroupSchema.safeParse({ ...group, min_select: 0, max_select: 0 }))).toMatchObject({
      message: "El máximo debe ser al menos uno",
      path: ["max_select"],
    });
  });

  it("exige que min_select y max_select sean enteros", () => {
    expect(issuesOf(modifierGroupSchema.safeParse({ ...group, min_select: 0.5 })).some((issue) => issue.path[0] === "min_select")).toBe(true);
    expect(issuesOf(modifierGroupSchema.safeParse({ ...group, max_select: 1.5 })).some((issue) => issue.path[0] === "max_select")).toBe(true);
  });

  it("allow_repeat acepta true y false, y exige el booleano", () => {
    expect(modifierGroupSchema.safeParse({ ...group, allow_repeat: true }).success).toBe(true);
    expect(modifierGroupSchema.safeParse({ ...group, allow_repeat: false }).success).toBe(true);
    const withoutRepeat = { name: group.name, min_select: group.min_select, max_select: group.max_select, options: group.options };
    expect(issuesOf(modifierGroupSchema.safeParse(withoutRepeat)).some((issue) => issue.path[0] === "allow_repeat")).toBe(true);
    expect(issuesOf(modifierGroupSchema.safeParse({ ...group, allow_repeat: "sí" })).some((issue) => issue.path[0] === "allow_repeat")).toBe(true);
  });
});

describe("(c) mensajes de validación del catálogo", () => {
  it("rechaza un grupo sin opciones con su mensaje", () => {
    expect(firstIssue(modifierGroupSchema.safeParse({ ...group, options: [] }))).toMatchObject({
      message: "Agrega al menos una opción",
      path: ["options"],
    });
  });

  it("rechaza una opción sin nombre con su mensaje", () => {
    expect(firstIssue(modifierOptionSchema.safeParse({ ...option, name: " " }))).toMatchObject({
      message: "El nombre es obligatorio",
      path: ["name"],
    });
    expect(
      firstIssue(modifierGroupSchema.safeParse({ ...group, options: [{ ...option, name: "" }] })),
    ).toMatchObject({ message: "El nombre es obligatorio", path: ["options", 0, "name"] });
  });

  it("rechaza una opción con precio negativo con su mensaje", () => {
    expect(firstIssue(modifierOptionSchema.safeParse({ ...option, price: -0.01 }))).toMatchObject({
      message: "El precio no puede ser negativo",
      path: ["price"],
    });
    expect(
      firstIssue(modifierGroupSchema.safeParse({ ...group, options: [{ ...option, price: -1 }] })),
    ).toMatchObject({ message: "El precio no puede ser negativo", path: ["options", 0, "price"] });
  });

  it("rechaza una opción con más de dos decimales con su mensaje", () => {
    expect(firstIssue(modifierOptionSchema.safeParse({ ...option, price: 0.555 }))).toMatchObject({
      message: "Usa hasta dos decimales",
      path: ["price"],
    });
  });
});
