import { describe, expect, it } from "vitest";
import { MEMBER_ROLES, saveMemberSchema } from "@/lib/validations/staff";
import { memberFormInput, memberFormErrors, memberServerErrorField, type MemberFormValues } from "./member-form-model";

const memberId = "11111111-1111-4111-8111-111111111111";
const registerId = "22222222-2222-4222-8222-222222222222";
const values: MemberFormValues = {
  firstName: " Alex ", lastName: " Rivera López ", email: "alex@example.com",
  active: true, roles: ["WAITER"], cashRegisterIds: [],
};
const credentials = { pin: "0012", password: "Example-password" };

describe("member form API boundary", () => {
  it("sends the full name, active state, email and exact four-digit PIN on creation", () => {
    const input = memberFormInput(values, credentials);
    expect(input).toEqual({ fullName: "Alex Rivera López", roles: ["WAITER"], active: true, emailLoginEnabled: true, email: "alex@example.com", password: credentials.password, pin: "0012" });
    expect(saveMemberSchema.safeParse(input).success).toBe(true);
  });
  it("omits unchanged credentials and includes the member ID on edit", () => {
    const input = memberFormInput(values, { pin: "", password: "" }, memberId);
    expect(input.memberId).toBe(memberId);
    expect(input).not.toHaveProperty("pin");
    expect(input).not.toHaveProperty("password");
    expect(saveMemberSchema.safeParse(input).success).toBe(true);
  });
  it("includes only the changed credential on edit", () => {
    const pin = memberFormInput(values, { pin: "0000", password: "" }, memberId);
    expect(pin.pin).toBe("0000");
    expect(pin).not.toHaveProperty("password");
    const password = memberFormInput(values, { pin: "", password: credentials.password }, memberId);
    expect(password.password).toBe(credentials.password);
    expect(password).not.toHaveProperty("pin");
  });
  it("drops hidden cash registers and only submits them with CASHIER", () => {
    const input = memberFormInput({ ...values, cashRegisterIds: [registerId] }, credentials);
    expect(input).not.toHaveProperty("cashRegisterIds");
    const cashier = memberFormInput({ ...values, roles: ["WAITER", "CASHIER"], cashRegisterIds: [registerId] }, credentials);
    expect(cashier.cashRegisterIds).toEqual([registerId]);
    expect(saveMemberSchema.safeParse(cashier).success).toBe(true);
  });
  it("uses the shared password policy and rejects five-digit PINs", () => {
    const input = memberFormInput(values, { pin: "00123", password: "short" });
    expect(memberFormErrors(values, input, false)).toMatchObject({ pin: "El PIN debe tener 4 dígitos", password: "La clave debe tener entre 8 y 72 caracteres" });
  });
  it("requires both name fields even when fullName alone would validate", () => {
    const draft = { ...values, firstName: "", lastName: "Rivera" };
    expect(memberFormErrors(draft, memberFormInput(draft, credentials), false).firstName).toBe("Completa este campo.");
    const noSurname = { ...values, lastName: " " };
    expect(memberFormErrors(noSurname, memberFormInput(noSurname, credentials), false).lastName).toBe("Completa este campo.");
  });
  it("requires a new PIN for a known missing PIN but leaves unknown presence to the server", () => {
    const input = memberFormInput(values, { pin: "", password: "" }, memberId);
    expect(memberFormErrors(values, input, false).pin).toBe("Asigna un PIN de 4 dígitos.");
    expect(memberFormErrors(values, input, null)).toEqual({});
  });
  it("follows the current API rule for inactive members with no roles", () => {
    const draft = { ...values, roles: [], active: false };
    expect(memberFormErrors(draft, memberFormInput(draft, credentials, memberId), true)).toEqual({});
    const active = { ...draft, active: true };
    expect(memberFormErrors(active, memberFormInput(active, credentials, memberId), true).roles).toBe("Un miembro sin roles debe quedar inactivo durante la transición");
  });
  it("only uses the assignable role catalog and has no branch payload", () => {
    const input = memberFormInput({ ...values, roles: [...MEMBER_ROLES], cashRegisterIds: [registerId] }, credentials);
    expect(input.roles).not.toContain("SUPER_ADMIN");
    expect(input).not.toHaveProperty("branchIds");
    expect(saveMemberSchema.safeParse(input).success).toBe(true);
  });
  it.each([
    ["Ese correo ya tiene una cuenta. Usa un correo diferente.", "email"],
    ["El PIN debe tener 4 dígitos", "pin"],
    ["La clave debe tener entre 8 y 72 caracteres", "password"],
    ["Las cajas asignadas deben estar activas y pertenecer a esta sucursal.", "cashRegisterIds"],
    ["No tienes permiso para asignar esos roles.", "roles"],
    ["Se guardaron los permisos, pero no el nombre. Recarga Personal y reintenta.", "firstName"],
    ["Inicia sesión para gestionar miembros.", undefined],
  ])("associates server message '%s' with %s without replacing it", (message, field) => {
    expect(memberServerErrorField(message)).toBe(field);
  });
});
