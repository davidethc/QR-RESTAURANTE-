import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, canAccessRoute, canHandleMoney, filterAllowedLinks, getLandingPath, getRoles, getRouteRedirect, hasPermission, isManager, type Permission, type PermissionRole } from "./permissions";

const screens: Permission[] = ["home", "pos", "tables", "kitchen", "menu.manage", "cash.manage", "availability.edit", "digitalMenu.view", "printing.manage", "branch.edit"];
const matrix = {
  WAITER: [true, false, true, false, false, false, true, true, true, false],
  CASHIER: [true, true, false, false, false, true, true, true, true, false],
  KITCHEN: [true, false, false, true, false, false, true, false, true, false],
};
describe("M00 §6", () => {
  for (const [role, expected] of Object.entries(matrix)) {
    it(`${role}: tabla completa`, () => expect(screens.map((screen) => hasPermission({ roles: [role] }, screen))).toEqual(expected));
  }
  it.each(["OWNER", "ADMIN"])("%s conserva acceso completo", (role) => {
    expect(screens.every((screen) => hasPermission(role, screen))).toBe(true);
    expect(isManager(role)).toBe(true);
    expect(getLandingPath(role)).toBe("/today");
  });
  it("gestores parciales sin privilegios de administrador", () => {
    expect(hasPermission(["MEMBERS_ADMIN"], "members.manage")).toBe(true);
    expect(hasPermission(["MEMBERS_ADMIN"], "members.manageAdmins")).toBe(false);
    expect(hasPermission(["BRANCH_MANAGER"], "branch.edit")).toBe(true);
    expect(hasPermission(["BRANCH_MANAGER"], "branch.create")).toBe(false);
    expect(hasPermission(["BRANCH_MANAGER"], "branch.delete")).toBe(false);
    expect(hasPermission(["MENU_MANAGER"], "menu.manage")).toBe(true);
    expect(isManager(["MEMBERS_ADMIN", "BRANCH_MANAGER", "MENU_MANAGER"])).toBe(false);
  });
  const roles = Object.keys(ROLE_PERMISSIONS).filter((role) => role !== "OWNER") as PermissionRole[];
  for (const first of roles) for (const second of roles) {
    it(`${first} + ${second}: unión exacta`, () => {
      for (const permission of [...screens, "sales.view", "reports.view", "members.manageAdmins"] as Permission[]) {
        expect(hasPermission([first, second], permission)).toBe(hasPermission(first, permission) || hasPermission(second, permission));
      }
    });
  }
});
describe("/orders (desviación temporal de la spec §6)", () => {
  it("el mesero atiende /orders sin acceso a dinero ni administración", () => {
    expect(canAccessRoute("WAITER", "/orders")).toBe(true);
    for (const path of ["/cash", "/sales", "/reports", "/staff", "/settings"]) expect(canAccessRoute("WAITER", path)).toBe(false);
    expect(hasPermission("WAITER", "cash.manage")).toBe(false);
    expect(hasPermission("WAITER", "pos")).toBe(false);
  });
  it("cocina no entra a /orders y va a su pantalla", () => {
    expect(canAccessRoute("KITCHEN", "/orders")).toBe(false);
    expect(getRouteRedirect("KITCHEN", "/orders")).toBe("/kitchen");
  });
  it.each(["OWNER", "ADMIN", "CASHIER"])("%s conserva /orders", (role) => expect(canAccessRoute(role, "/orders")).toBe(true));
});
describe("sesión y navegación", () => {
  it("roles presentes prevalecen, incluido vacío; legacy solo sin roles", () => {
    expect(getRoles({ role: "ADMIN", roles: ["WAITER"] })).toEqual(["WAITER"]);
    expect(getRoles({ role: "ADMIN", roles: [] })).toEqual([]);
    expect(getRoles({ role: "KITCHEN" })).toEqual(["KITCHEN"]);
    expect(getRoles({ role: "WAITER", roles: null })).toEqual(["WAITER"]);
    expect(getRoles({ role: "OWNER", roles: [] })).toEqual(["OWNER"]);
    expect(getRoles(["OWNER", "SUPER_ADMIN", "fake"])).toEqual([]);
  });
  it.each([["WAITER", "/tables"], ["CASHIER", "/orders"], ["KITCHEN", "/kitchen"]])("%s entra en %s y redirige sin bucles", (role, route) => {
    expect(getLandingPath(role)).toBe(route);
    const allowed = role === "WAITER" ? ["/orders", "/tables"] : [route];
    for (const path of ["/orders", "/tables", "/kitchen"]) expect(getRouteRedirect(role, path)).toBe(allowed.includes(path) ? null : route);
    expect(getRouteRedirect(role, "/menu")).toBe("/today");
    expect(getRouteRedirect(role, "/cash")).toBe(role === "CASHIER" ? null : "/today");
    expect(getRouteRedirect(role, "/today")).toBeNull();
  });
  it("primer rol operativo y navegación combinada", () => {
    const member = { role: "KITCHEN", roles: ["WAITER", "CASHIER"] };
    expect(getLandingPath(member)).toBe("/tables");
    expect(getLandingPath(["CASHIER", "WAITER"])).toBe("/orders");
    expect(getRouteRedirect(member, "/orders")).toBeNull();
    expect(getRouteRedirect(member, "/tables/abc/order")).toBeNull();
    expect(canHandleMoney(member)).toBe(true);
    expect(hasPermission("WAITER", "sales.summary")).toBe(false);
  });
  it("sidebar usa matriz y límites de segmento", () => {
    const links = ["/today", "/orders", "/tables", "/menu", "/cash", "/settings"].map((href) => ({ href }));
    expect(filterAllowedLinks("WAITER", links).map((link) => link.href)).toEqual(["/today", "/orders", "/tables"]);
    expect(canAccessRoute("ADMIN", "/menux")).toBe(false);
    expect(canAccessRoute("ADMIN", "/settings/unknown")).toBe(true);
    expect(canAccessRoute("WAITER", "/ajustes/impresion")).toBe(true);
    expect(canAccessRoute("WAITER", "/ajustes/otros")).toBe(false);
    expect(getLandingPath({ roles: [] })).toBe("/login");
    expect(getRouteRedirect(null, "/today")).toBe("/login");
  });
});
