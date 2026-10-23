import { describe, expect, it } from "vitest";
import { CASH_MOVEMENT_REASON } from "@/config/constants";
import { CASH_REASONS, movementBlockReason, movementType } from "./cash-movement-reasons";

describe("CASH_REASONS", () => {
  it("meter dinero solo ofrece refuerzo de fondo y otro ingreso", () => {
    expect(CASH_REASONS.IN.map((r) => r.label)).toEqual(["Refuerzo de fondo", "Otro ingreso"]);
  });

  it("sacar dinero ofrece las seis salidas", () => {
    expect(CASH_REASONS.OUT.map((r) => r.label)).toEqual([
      "Gasto",
      "Pago a proveedor",
      "Reparto de propinas",
      "Retiro",
      "Devolución",
      "Otro",
    ]);
  });

  it("todos los motivos existen en el contrato de la base", () => {
    const valid = new Set(Object.values(CASH_MOVEMENT_REASON));
    for (const r of [...CASH_REASONS.IN, ...CASH_REASONS.OUT]) expect(valid.has(r.reason)).toBe(true);
  });

  it("solo los 'otro' exigen nota", () => {
    const withNote = [...CASH_REASONS.IN, ...CASH_REASONS.OUT].filter((r) => r.requiresNote);
    expect(withNote.every((r) => r.reason === CASH_MOVEMENT_REASON.OTHER)).toBe(true);
  });
});

describe("movementType", () => {
  it("traduce la dirección al tipo de la RPC", () => {
    expect(movementType("IN")).toBe("IN");
    expect(movementType("OUT")).toBe("OUT");
  });
});

describe("movementBlockReason", () => {
  const gasto = CASH_REASONS.OUT[0];
  const otro = CASH_REASONS.OUT[5];

  it("pide motivo, monto y nota en ese orden", () => {
    expect(movementBlockReason(null, 5, "")).toBe("Elige el motivo.");
    expect(movementBlockReason(gasto, 0, "")).toBe("Escribe el monto.");
    expect(movementBlockReason(otro, 5, "ab")).toBe("Escribe de qué es (mínimo 3 letras).");
  });

  it("listo cuando todo está completo", () => {
    expect(movementBlockReason(gasto, 2.5, "")).toBeNull();
    expect(movementBlockReason(otro, 2.5, "Taxi")).toBeNull();
  });
});
