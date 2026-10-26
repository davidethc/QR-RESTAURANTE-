import { describe, expect, it } from "vitest";
import { createTablesSchema, firstTakenNumber, nextTableNumber } from "./tables";

function errorsOf(input: Record<string, unknown>) {
  const r = createTablesSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("createTablesSchema", () => {
  it("asks for the number when a field is empty instead of saying it starts at 1", () => {
    expect(errorsOf({ fromNumber: "", toNumber: "", name: "" })).toEqual({
      fromNumber: "Escribe el número de la mesa.",
      toNumber: "Escribe el número de la mesa.",
    });
  });

  it("still rejects zero and negative numbers", () => {
    expect(errorsOf({ fromNumber: "0", toNumber: "0" }).fromNumber).toBe("El número de mesa empieza en 1.");
  });

  it("accepts a single table and a range", () => {
    expect(createTablesSchema.parse({ fromNumber: "8", toNumber: "8", name: "Terraza" })).toEqual({
      fromNumber: 8,
      toNumber: 8,
      name: "Terraza",
    });
    expect(createTablesSchema.safeParse({ fromNumber: "8", toNumber: "12" }).success).toBe(true);
  });

  it("keeps the range rules", () => {
    expect(errorsOf({ fromNumber: "5", toNumber: "3" }).toNumber).toBe("El número final no puede ser menor que el inicial.");
    expect(errorsOf({ fromNumber: "1", toNumber: "51" }).toNumber).toBe("Máximo 50 mesas por vez.");
  });
});

describe("table numbering helpers", () => {
  it("suggests the number after the highest existing table", () => {
    expect(nextTableNumber([])).toBe(1);
    expect(nextTableNumber([1, 2, 3, 7])).toBe(8);
  });

  it("finds the first number in a range that already exists", () => {
    expect(firstTakenNumber([1, 2, 7], 5, 9)).toBe(7);
    expect(firstTakenNumber([1, 2, 7], 8, 10)).toBeNull();
  });
});
