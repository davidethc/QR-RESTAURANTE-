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

import { MEMBER_ROLES, saveMemberSchema } from "./staff";

const memberId = "11111111-1111-4111-8111-111111111111";
const registerId = "22222222-2222-4222-8222-222222222222";
const edit = { memberId, fullName: "Ana Pérez", roles: ["WAITER"], active: true, emailLoginEnabled: false };

describe("saveMemberSchema: roles combinables y campos visibles", () => {
  it("evalúa cajas condicionalmente para las 127 combinaciones de roles", () => {
    for (let mask = 1; mask < 1 << MEMBER_ROLES.length; mask++) {
      const roles = MEMBER_ROLES.filter((_, index) => mask & (1 << index));
      const cashier = roles.includes("CASHIER");
      expect(saveMemberSchema.safeParse({ ...edit, roles }).success).toBe(!cashier);
      expect(saveMemberSchema.safeParse({ ...edit, roles, cashRegisterIds: [registerId] }).success).toBe(true);
    }
  });
  it("ignora valores de cajas ocultas al desmarcar Cajero", () => {
    expect(saveMemberSchema.parse({ ...edit, cashRegisterIds: "valor anterior inválido" }).cashRegisterIds).toEqual([]);
  });
  it("asocia el error de Cajero a Cajas asignadas y valida sus IDs", () => {
    const result = saveMemberSchema.safeParse({ ...edit, roles: ["WAITER", "CASHIER"] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["cashRegisterIds"]);
    expect(saveMemberSchema.safeParse({ ...edit, roles: ["CASHIER"], cashRegisterIds: ["otra"] }).success).toBe(false);
  });
  it("al crear el PIN siempre se genera (con correo o sin él) y nunca se acepta uno del cliente", () => {
    for (const emailLoginEnabled of [true, false]) {
      const create = { ...edit, memberId: undefined, emailLoginEnabled, email: "ana@correo.com", password: "clave1234" };
      const parsed = saveMemberSchema.parse({ ...create, pin: "0123" });
      expect(parsed.generatePin).toBe(true);
      expect(parsed).not.toHaveProperty("pin");
    }
  });
  it("en edición conserva el PIN salvo que se pida generar uno nuevo", () => {
    expect(saveMemberSchema.parse(edit).generatePin).toBe(false);
    expect(saveMemberSchema.parse({ ...edit, generatePin: true }).generatePin).toBe(true);
    expect(saveMemberSchema.parse({ ...edit, pin: "0123" })).not.toHaveProperty("pin");
    expect(saveMemberSchema.safeParse({ ...edit, generatePin: "sí" }).success).toBe(false);
  });
  it("ignora correo y clave ocultos si el acceso con correo está desactivado", () => {
    const result = saveMemberSchema.parse({ ...edit, email: "incorrecto", password: "x" });
    expect(result.email).toBeUndefined();
    expect(result.password).toBeUndefined();
  });
  it("al activar correo exige email y normaliza; la clave solo se exige en el alta o si se cambia", () => {
    expect(saveMemberSchema.safeParse({ ...edit, emailLoginEnabled: true }).success).toBe(false);
    expect(saveMemberSchema.parse({ ...edit, emailLoginEnabled: true, email: " Ana@Correo.com " }).email).toBe("ana@correo.com");
    expect(saveMemberSchema.safeParse({ ...edit, emailLoginEnabled: true, email: "ana@correo.com", password: "corta" }).success).toBe(false);
  });
  it("no asigna OWNER ni SUPER_ADMIN y elimina roles y cajas duplicados", () => {
    for (const role of ["OWNER", "SUPER_ADMIN", "DESCONOCIDO"]) expect(saveMemberSchema.safeParse({ ...edit, roles: [role] }).success).toBe(false);
    const result = saveMemberSchema.parse({ ...edit, roles: ["CASHIER", "CASHIER"], cashRegisterIds: [registerId, registerId] });
    expect(result.roles).toEqual(["CASHIER"]);
    expect(result.cashRegisterIds).toEqual([registerId]);
  });
  it("permite cero roles solo inactivo mientras convive el rol legacy", () => {
    expect(saveMemberSchema.safeParse({ ...edit, roles: [], active: false }).success).toBe(true);
    expect(saveMemberSchema.safeParse({ ...edit, roles: [] }).success).toBe(false);
  });
  it("no acepta hashes ni padres proporcionados por el cliente", () => {
    const result = saveMemberSchema.parse({ ...edit, pin_hash: "hash falso", restaurant_id: memberId, user_id: memberId, hasPin: true });
    expect(result).not.toHaveProperty("pin_hash");
    expect(result).not.toHaveProperty("hasPin");
    expect(result).not.toHaveProperty("restaurant_id");
  });
});
