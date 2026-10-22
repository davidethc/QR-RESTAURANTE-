import { describe, expect, it } from "vitest";
import {
  bumpOption,
  composeNote,
  fromPrice,
  groupError,
  splitLineInList,
  splitLineIntoUnits,
  totalQuantity,
} from "@/lib/order-lines";
import type { StaffModifierGroup } from "@/types/menu";

let n = 0;
const newId = () => `id-${++n}`;

describe("splitLineIntoUnits (Separar uno)", () => {
  it("divide una línea de 3 en 3 de cantidad 1 y conserva el total", () => {
    const line = { id: "a", quantity: 3, name: "Pizza", notes: "sin sal" };
    const out = splitLineIntoUnits(line, newId);
    expect(out).toHaveLength(3);
    expect(out.every((l) => l.quantity === 1 && l.notes === "sin sal")).toBe(true);
    expect(out[0].id).toBe("a");
    expect(new Set(out.map((l) => l.id)).size).toBe(3);
    expect(totalQuantity(out)).toBe(totalQuantity([line]));
  });

  it("conserva la variante 'Docena' (una unidad sigue siendo una docena)", () => {
    const line = { id: "d", quantity: 2, variantId: "v-docena", variantName: "Docena" };
    const out = splitLineIntoUnits(line, newId);
    expect(out.map((l) => l.variantId)).toEqual(["v-docena", "v-docena"]);
    expect(out.map((l) => l.quantity)).toEqual([1, 1]);
    expect(totalQuantity(out)).toBe(2);
  });

  it("una línea de 1 queda igual", () => {
    const out = splitLineIntoUnits({ id: "x", quantity: 1 }, newId);
    expect(out).toEqual([{ id: "x", quantity: 1 }]);
  });

  it("en una lista solo toca la línea indicada", () => {
    const list = [
      { id: "a", quantity: 2 },
      { id: "b", quantity: 4 },
    ];
    const out = splitLineInList(list, "b", newId);
    expect(out).toHaveLength(5);
    expect(totalQuantity(out)).toBe(totalQuantity(list));
    expect(out[0]).toEqual({ id: "a", quantity: 2 });
  });
});

describe("fromPrice", () => {
  it("con varias variantes usa la más barata", () => {
    expect(
      fromPrice(5, [
        { id: "1", name: "Unidad", price: 1.5 },
        { id: "2", name: "Docena", price: 15 },
      ])
    ).toEqual({ price: 1.5, hasChoice: true });
  });
  it("con una variante no hay elección", () => {
    expect(fromPrice(5, [{ id: "1", name: "", price: 4 }])).toEqual({ price: 4, hasChoice: false });
  });
});

const group: StaffModifierGroup = {
  id: "g",
  name: "Salsas",
  min_select: 1,
  max_select: 2,
  allow_repeat: false,
  options: [
    { id: "o1", name: "BBQ", price: 0 },
    { id: "o2", name: "Ajo", price: 0 },
  ],
};

describe("personalizaciones", () => {
  it("exige el mínimo", () => {
    expect(groupError(group, {})).toBe("Elige una opción de Salsas.");
    expect(groupError(group, { o1: 1 })).toBeNull();
  });
  it("respeta max y allow_repeat", () => {
    let s = bumpOption(group, {}, "o1", 1);
    s = bumpOption(group, s, "o1", 1); // repetir no permitido
    expect(s).toEqual({ o1: 1 });
    s = bumpOption(group, s, "o2", 1);
    s = bumpOption({ ...group, allow_repeat: true }, s, "o1", 1); // ya en max
    expect(s).toEqual({ o1: 1, o2: 1 });
    expect(bumpOption(group, s, "o1", -1)).toEqual({ o2: 1 });
  });
  it("permite repetir cuando allow_repeat", () => {
    const g = { ...group, allow_repeat: true };
    expect(bumpOption(g, { o1: 1 }, "o1", 1)).toEqual({ o1: 2 });
  });
});

describe("composeNote", () => {
  it("une y recorta a 200", () => {
    expect(composeNote("BBQ", "sin sal")).toBe("BBQ · sin sal");
    expect(composeNote("", " x ")).toBe("x");
    expect(composeNote("a".repeat(300), "")).toHaveLength(200);
  });
});
