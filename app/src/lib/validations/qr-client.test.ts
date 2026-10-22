import { describe, expect, it } from "vitest";
import { formatCountdown, secondsLeft, tableNameSchema } from "./qr-client";

describe("tableNameSchema", () => {
  it("recorta y junta espacios", () => {
    expect(tableNameSchema.parse("  Ana   María ")).toBe("Ana María");
  });
  it("rechaza nombres muy cortos o largos", () => {
    expect(tableNameSchema.safeParse("A").success).toBe(false);
    expect(tableNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
  it("rechaza vacío", () => {
    expect(tableNameSchema.safeParse("   ").success).toBe(false);
  });
});

describe("cuenta regresiva", () => {
  it("calcula segundos restantes sin bajar de 0", () => {
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
  });
  it("formatea m:ss", () => {
    expect(formatCountdown(75)).toBe("1:15");
    expect(formatCountdown(9)).toBe("0:09");
  });
});
