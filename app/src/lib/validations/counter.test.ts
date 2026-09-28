import { describe, it, expect } from "vitest";
import { cancelCounterSaleSchema, createCounterSaleSchema } from "./counter";

const KEY = "0b6d1c1e-8f7a-4b9e-9d51-3a4f2c1b0e77";
const PRODUCT = "7714e49b-582d-4a00-bf46-10d267139d7c";

describe("createCounterSaleSchema", () => {
  it("acepta una venta mínima y limpia textos vacíos", () => {
    const r = createCounterSaleSchema.safeParse({
      items: [{ productId: PRODUCT, quantity: "2", notes: "  " }],
      notes: "",
      customerLabel: "  Ana  ",
      idempotencyKey: KEY,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.items[0]).toEqual({ productId: PRODUCT, quantity: 2, notes: undefined });
      expect(r.data.notes).toBeUndefined();
      expect(r.data.customerLabel).toBe("Ana");
      expect(r.data.restaurantId).toBeUndefined();
    }
  });

  it("exige productos y la clave de idempotencia", () => {
    expect(createCounterSaleSchema.safeParse({ items: [], idempotencyKey: KEY }).success).toBe(false);
    expect(
      createCounterSaleSchema.safeParse({ items: [{ productId: PRODUCT, quantity: 1 }] }).success
    ).toBe(false);
  });

  it("rechaza cantidades fuera de rango o no enteras", () => {
    for (const quantity of [0, -1, 1000, 1.5]) {
      const r = createCounterSaleSchema.safeParse({
        items: [{ productId: PRODUCT, quantity }],
        idempotencyKey: KEY,
      });
      expect(r.success, `quantity=${quantity}`).toBe(false);
    }
  });

  it("rechaza un nombre de más de 40 caracteres", () => {
    const r = createCounterSaleSchema.safeParse({
      items: [{ productId: PRODUCT, quantity: 1 }],
      customerLabel: "x".repeat(41),
      idempotencyKey: KEY,
    });
    expect(r.success).toBe(false);
  });
});

describe("cancelCounterSaleSchema", () => {
  it("exige motivo de al menos 3 caracteres", () => {
    expect(cancelCounterSaleSchema.safeParse({ billId: KEY, reason: " no " }).success).toBe(false);
    expect(cancelCounterSaleSchema.safeParse({ billId: KEY, reason: "se fue" }).success).toBe(true);
  });
});
