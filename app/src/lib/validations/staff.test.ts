import { describe, expect, it } from "vitest";
import {
  createStaffSchema,
  generateTempPassword,
  updateStaffSchema,
} from "./staff";

describe("createStaffSchema", () => {
  const valid = {
    fullName: "  Ana Pérez ",
    email: " Ana@Correo.com ",
    role: "WAITER",
    password: "clave1234",
  };

  it("normaliza nombre y correo", () => {
    const parsed = createStaffSchema.parse(valid);
    expect(parsed.fullName).toBe("Ana Pérez");
    expect(parsed.email).toBe("ana@correo.com");
  });

  it("no permite crear dueños", () => {
    expect(createStaffSchema.safeParse({ ...valid, role: "OWNER" }).success).toBe(false);
  });

  it("exige clave de 8 caracteres", () => {
    expect(createStaffSchema.safeParse({ ...valid, password: "1234567" }).success).toBe(false);
  });
});

describe("updateStaffSchema", () => {
  it("exige un id válido", () => {
    expect(
      updateStaffSchema.safeParse({ memberId: "x", role: "KITCHEN", active: true }).success
    ).toBe(false);
  });
});

describe("generateTempPassword", () => {
  it("genera claves válidas sin caracteres ambiguos", () => {
    const pwd = generateTempPassword();
    expect(pwd).toHaveLength(10);
    expect(pwd).not.toMatch(/[0O1lI]/);
    expect(createStaffSchema.shape.password.safeParse(pwd).success).toBe(true);
  });
});
