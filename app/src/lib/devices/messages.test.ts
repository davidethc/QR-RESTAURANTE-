import { describe, expect, it } from "vitest";
import { pinFailureMessage } from "./messages";
import { activateDeviceSchema, pinSchema } from "@/lib/validations/devices";

describe("mensajes de PIN", () => {
  it("el bloqueo por intentos se muestra como mensaje amable", () => {
    expect(pinFailureMessage("LOCKED")).toMatch(/Demasiados intentos/);
  });
  it("PIN incorrecto y dispositivo revocado tienen texto propio", () => {
    expect(pinFailureMessage("INVALID")).toMatch(/incorrecto/);
    expect(pinFailureMessage("DEVICE_INVALID")).toMatch(/ya no tiene acceso/);
  });
});

describe("validaciones", () => {
  it("el PIN son exactamente 4 dígitos", () => {
    expect(pinSchema.safeParse("1234").success).toBe(true);
    for (const bad of ["123", "12345", "12a4", ""]) expect(pinSchema.safeParse(bad).success).toBe(false);
  });
  it("el token es hex de 64 y el nombre de 2 a 60", () => {
    const token = "a".repeat(64);
    expect(activateDeviceSchema.safeParse({ token, name: "Caja" }).success).toBe(true);
    expect(activateDeviceSchema.safeParse({ token: "x", name: "Caja" }).success).toBe(false);
    expect(activateDeviceSchema.safeParse({ token, name: "a" }).success).toBe(false);
  });
});
