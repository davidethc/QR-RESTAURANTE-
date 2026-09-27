import { describe, it, expect } from "vitest";
import {
  applyDiscount,
  calcChange,
  fromCents,
  nextEqualShare,
  splitEqually,
  toCents,
} from "./money";

const sum = (values: number[]) => values.reduce((acc, v) => acc + toCents(v), 0);

describe("toCents / fromCents", () => {
  it("convierte sin errores de punto flotante", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents("12.34")).toBe(1234);
    expect(fromCents(1234)).toBe(12.34);
  });

  it("rechaza montos no numéricos y centavos fraccionarios", () => {
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents("abc")).toThrow();
    expect(() => fromCents(1.5)).toThrow();
  });
});

describe("calcChange", () => {
  it("vuelto exacto con y sin propina", () => {
    expect(calcChange(20, 13.45)).toBe(6.55);
    expect(calcChange(20, 13.45, 1.55)).toBe(5);
    expect(calcChange(10, 10)).toBe(0);
  });

  it("evita el error clásico de flotantes", () => {
    expect(calcChange(0.3, 0.1, 0.2)).toBe(0);
  });

  it("efectivo insuficiente es error", () => {
    expect(() => calcChange(10, 9.5, 1)).toThrow("no alcanza");
  });

  it("monto cero o propina negativa es error", () => {
    expect(() => calcChange(10, 0)).toThrow();
    expect(() => calcChange(10, 5, -1)).toThrow();
  });
});

describe("splitEqually", () => {
  it("3 x 10.00 = 3.33, 3.33, 3.34 (diseño)", () => {
    expect(splitEqually(10, 3)).toEqual([3.33, 3.33, 3.34]);
  });

  it("la suma siempre es exacta y la última absorbe el residuo", () => {
    for (const total of [0.01, 0.99, 1, 7.77, 10, 99.99, 123.45, 1000.01]) {
      for (const parts of [1, 2, 3, 4, 6, 7, 13, 50]) {
        const result = splitEqually(total, parts);
        expect(result).toHaveLength(parts);
        expect(sum(result)).toBe(toCents(total));
        const first = toCents(result[0]);
        for (const part of result.slice(0, -1)) expect(toCents(part)).toBe(first);
        expect(toCents(result[parts - 1])).toBeGreaterThanOrEqual(first);
      }
    }
  });

  it("total menor que las partes: todas 0 menos la última", () => {
    expect(splitEqually(0.02, 3)).toEqual([0, 0, 0.02]);
  });

  it("partes fuera de rango es error", () => {
    expect(() => splitEqually(10, 0)).toThrow();
    expect(() => splitEqually(10, 51)).toThrow();
    expect(() => splitEqually(10, 2.5)).toThrow();
  });
});

describe("nextEqualShare", () => {
  it("recorre 3 x 10.00 igual que la base", () => {
    expect(nextEqualShare(10, 3, 10)).toBe(3.33);
    expect(nextEqualShare(10, 3, 6.67)).toBe(3.33);
    expect(nextEqualShare(10, 3, 3.34)).toBe(3.34);
    expect(nextEqualShare(10, 3, 0)).toBe(0);
  });

  it("si queda menos de dos partes, cobra todo el saldo", () => {
    expect(nextEqualShare(10, 3, 3.4)).toBe(3.4);
  });
});

describe("applyDiscount", () => {
  it("porcentaje redondea al centavo (half up, como round() de Postgres)", () => {
    expect(applyDiscount(10.05, "PERCENT", 15)).toBe(1.51);
    expect(applyDiscount(33.33, "PERCENT", 10)).toBe(3.33);
    expect(applyDiscount(0.05, "PERCENT", 10)).toBe(0.01);
    expect(applyDiscount(19.99, "PERCENT", 12.5)).toBe(2.5);
  });

  it("100% = cortesía, descuenta todo", () => {
    expect(applyDiscount(42.1, "PERCENT", 100)).toBe(42.1);
  });

  it("fijo no supera la base", () => {
    expect(applyDiscount(10, "FIXED", 2.5)).toBe(2.5);
    expect(applyDiscount(10, "FIXED", 10)).toBe(10);
    expect(() => applyDiscount(10, "FIXED", 10.01)).toThrow();
  });

  it("valores inválidos son error", () => {
    expect(() => applyDiscount(10, "PERCENT", 0)).toThrow();
    expect(() => applyDiscount(10, "PERCENT", 101)).toThrow();
    expect(() => applyDiscount(10, "FIXED", -1)).toThrow();
  });
});
