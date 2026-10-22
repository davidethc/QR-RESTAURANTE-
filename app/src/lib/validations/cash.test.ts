import { describe, it, expect } from "vitest";
import { cashCountsSchema, cashCutSchema, closeCashSessionSchema } from "./cash";

/**
 * Regresión del bug P1 de QA 2026-09-26: dejar Tarjeta/Transferencia/Otro en
 * blanco (su estado normal cuando ese método no se usó en el turno) rompía
 * el cierre de caja en silencio. React Hook Form deja esas claves presentes
 * con valor `undefined` (no las omite), y `z.partialRecord` de Zod v4
 * validaba esas claves igual, produciendo NaN. Ver close-cash-dialog.tsx.
 */
describe("cashCountsSchema", () => {
  it("acepta solo efectivo contado, el resto ausente", () => {
    const result = cashCountsSchema.safeParse({ CASH: 28.75 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ CASH: 28.75 });
    }
  });

  it("acepta efectivo + tarjeta con valor `undefined` (campo vacío en el form, no se omite la clave)", () => {
    const result = cashCountsSchema.safeParse({
      CASH: 10,
      CARD: undefined,
      TRANSFER: undefined,
      OTHER: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ CASH: 10 });
    }
  });

  it("exige al menos efectivo cuando todos los métodos están vacíos", () => {
    const result = cashCountsSchema.safeParse({
      CASH: undefined,
      CARD: undefined,
      TRANSFER: undefined,
      OTHER: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const cashIssue = result.error.issues.find((i) => i.path[0] === "CASH");
      expect(cashIssue?.message).toBe("Falta el conteo de efectivo.");
    }
  });

  it("rechaza un valor negativo con un mensaje por campo", () => {
    const result = cashCountsSchema.safeParse({ CASH: -5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const cashIssue = result.error.issues.find((i) => i.path[0] === "CASH");
      expect(cashIssue?.message).toBe("Conteo: no puede ser negativo.");
    }
  });

  it("redondea a centavos", () => {
    const result = cashCountsSchema.safeParse({ CASH: 10.005 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.CASH).toBe(10.01);
  });
});

describe("closeCashSessionSchema", () => {
  const cashSessionId = "11111111-1111-4111-8111-111111111111";

  it("valida un cierre real con métodos parcialmente vacíos (repro exacto del bug de QA)", () => {
    const result = closeCashSessionSchema.safeParse({
      cashSessionId,
      counts: { CASH: 27.75, CARD: undefined, TRANSFER: undefined, OTHER: undefined },
      notes: "",
    });
    expect(result.success).toBe(true);
  });

  it("falla con un mensaje claro cuando falta efectivo", () => {
    const result = closeCashSessionSchema.safeParse({
      cashSessionId,
      counts: {},
      notes: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const cashIssue = result.error.issues.find((i) => i.path.join(".") === "counts.CASH");
      expect(cashIssue).toBeDefined();
    }
  });
});

describe("cashCutSchema", () => {
  const id = "3f8a1c52-7d3e-4b6a-9c11-2e5d8f0a7b44";
  it("acepta corte con fondo y sin omitir pendientes", () => {
    const r = cashCutSchema.safeParse({ cashSessionId: id, counts: { CASH: 100 }, cashFloatLeft: 40 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.skipPendingOrders).toBe(false);
  });
  it("rechaza fondo mayor que el efectivo contado", () => {
    const r = cashCutSchema.safeParse({ cashSessionId: id, counts: { CASH: 30 }, cashFloatLeft: 40 });
    expect(r.success).toBe(false);
  });
  it("exige efectivo contado", () => {
    expect(cashCutSchema.safeParse({ cashSessionId: id, counts: { CARD: 5 } }).success).toBe(false);
  });
  it("el fondo vacío es 0", () => {
    const r = cashCutSchema.safeParse({ cashSessionId: id, counts: { CASH: 10 } });
    expect(r.success && r.data.cashFloatLeft).toBe(0);
  });
});
