import { describe, it, expect } from "vitest";
import { cancelCounterSaleSchema } from "./counter";

const KEY = "0b6d1c1e-8f7a-4b9e-9d51-3a4f2c1b0e77";

describe("cancelCounterSaleSchema", () => {
  it("exige motivo de al menos 3 caracteres", () => {
    expect(cancelCounterSaleSchema.safeParse({ billId: KEY, reason: " no " }).success).toBe(false);
    expect(cancelCounterSaleSchema.safeParse({ billId: KEY, reason: "se fue" }).success).toBe(true);
  });
});
