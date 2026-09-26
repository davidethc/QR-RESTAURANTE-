import { describe, expect, it } from "vitest";
import { formatPrice, normalizeText } from "@/lib/utils";

describe("formatPrice", () => {
  it("formatea un entero como dólares con dos decimales", () => {
    expect(formatPrice(5)).toBe("$5,00");
  });

  it("formatea decimales redondeando a centavos", () => {
    expect(formatPrice(5.5)).toBe("$5,50");
  });

  it("usa separador de miles con punto y decimales con coma (es-EC)", () => {
    expect(formatPrice(1234.5)).toBe("$1.234,50");
  });

  it("formatea cero", () => {
    expect(formatPrice(0)).toBe("$0,00");
  });

  it("formatea montos negativos", () => {
    expect(formatPrice(-3.25)).toBe("$-3,25");
  });
});

describe("normalizeText", () => {
  it("quita tildes y pasa a minúsculas", () => {
    expect(normalizeText("Café con leche")).toBe("cafe con leche");
  });

  it("permite que 'cafe' encuentre 'Café'", () => {
    const query = normalizeText("cafe");
    const target = normalizeText("Café con leche");
    expect(target.includes(query)).toBe(true);
  });

  it("no cambia texto que ya está normalizado", () => {
    expect(normalizeText("pizza margarita")).toBe("pizza margarita");
  });

  it("normaliza todas las vocales acentuadas (la ñ también pierde la virgulilla, es una limitación conocida)", () => {
    expect(normalizeText("ÁÉÍÓÚ Ñoño")).toBe("aeiou nono");
  });

  it("devuelve cadena vacía para entrada vacía", () => {
    expect(normalizeText("")).toBe("");
  });
});
