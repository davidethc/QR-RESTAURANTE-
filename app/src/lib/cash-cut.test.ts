import { describe, expect, it } from "vitest";
import {
  cashToWithdraw,
  cutResultLabel,
  denominationTotal,
  formatFolios,
  signedAmount,
} from "./cash-cut";

describe("denominationTotal", () => {
  it("suma cantidad x valor sin errores de flotante", () => {
    expect(denominationTotal({ b20: 2, b5: 1, c25: 3, c10: 1, c1c: 4 })).toBe(45.89);
  });
  it("ignora vacíos, negativos y NaN", () => {
    expect(denominationTotal({ b10: undefined, b5: -2, b1: Number.NaN, c1: 2 })).toBe(2);
  });
  it("0 sin conteo", () => {
    expect(denominationTotal({})).toBe(0);
  });
});

describe("cashToWithdraw", () => {
  it("contado menos fondo", () => {
    expect(cashToWithdraw(150.5, 50)).toBe(100.5);
  });
  it("nunca negativo", () => {
    expect(cashToWithdraw(10, 50)).toBe(0);
  });
});

describe("etiquetas", () => {
  it("resultado", () => {
    expect(cutResultLabel("EXACT")).toBe("Exacto");
    expect(cutResultLabel("SHORT")).toBe("Faltante");
    expect(cutResultLabel("OVER")).toBe("Sobrante");
    expect(cutResultLabel(null)).toBe("—");
  });
  it("folios", () => {
    expect(formatFolios([])).toBe("");
    expect(formatFolios([4])).toBe("#4");
    expect(formatFolios([4, 7])).toBe("#4 y #7");
    expect(formatFolios([4, 7, 9])).toBe("#4, #7 y #9");
  });
  it("diferencia con signo", () => {
    const f = (n: number) => `$${n.toFixed(2)}`;
    expect(signedAmount(2, f)).toBe("+$2.00");
    expect(signedAmount(-1.5, f)).toBe("-$1.50");
    expect(signedAmount(0, f)).toBe("$0.00");
  });
});
