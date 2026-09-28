import { describe, expect, it } from "vitest";
import { billingSettingsSchema } from "./restaurant";

describe("billingSettingsSchema", () => {
  const valid = { billingEnabled: true, maxWaiterDiscountPct: "10", businessDayCutoff: "04:00" };

  it("convierte el porcentaje escrito a número", () => {
    expect(billingSettingsSchema.parse(valid).maxWaiterDiscountPct).toBe(10);
  });

  it("rechaza porcentajes fuera de 0–100", () => {
    expect(billingSettingsSchema.safeParse({ ...valid, maxWaiterDiscountPct: "150" }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ ...valid, maxWaiterDiscountPct: "-1" }).success).toBe(false);
  });

  it("solo acepta cortes de madrugada o mañana", () => {
    expect(billingSettingsSchema.safeParse({ ...valid, businessDayCutoff: "00:00" }).success).toBe(true);
    expect(billingSettingsSchema.safeParse({ ...valid, businessDayCutoff: "18:00" }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ ...valid, businessDayCutoff: "4:00" }).success).toBe(false);
  });
});
