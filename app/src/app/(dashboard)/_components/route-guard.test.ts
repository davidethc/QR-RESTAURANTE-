import { describe, expect, it } from "vitest";
import { resolvePanelRedirect } from "./route-guard";

// Reglas que antes cubría proxy.test.ts: ahora las aplica el layout.
describe("resolvePanelRedirect: navegación silenciosa con roles combinados", () => {
  it.each([["WAITER", "/tables"], ["CASHIER", "/orders"], ["KITCHEN", "/kitchen"], ["ADMIN", "/today"]])(
    "entrada %s → %s sin conservar la marca de entrada",
    (role, expected) => {
      expect(resolvePanelRedirect({ role: "WAITER", roles: [role] }, "/today?entrada=1")).toBe(expected);
    }
  );
  it("niega URL directa antes de renderizar", () => {
    expect(resolvePanelRedirect({ role: "ADMIN", roles: ["KITCHEN"] }, "/menu?private=1")).toBe("/today");
  });
  it("permite el segundo rol y permite Inicio fuera de la entrada", () => {
    const member = { role: "WAITER", roles: ["WAITER", "CASHIER"] };
    expect(resolvePanelRedirect(member, "/orders")).toBeNull();
    expect(resolvePanelRedirect(member, "/today")).toBeNull();
  });
  it("mesero entra a /orders pero no a caja, ventas, reportes, personal ni ajustes", () => {
    const member = { role: "WAITER", roles: ["WAITER"] };
    expect(resolvePanelRedirect(member, "/orders")).toBeNull();
    for (const path of ["/cash", "/sales", "/reports", "/staff", "/settings"]) {
      expect(resolvePanelRedirect(member, path)).toBe("/today");
    }
  });
  it("cocina no entra a /orders", () => {
    expect(resolvePanelRedirect({ role: "KITCHEN", roles: ["KITCHEN"] }, "/orders")).toBe("/kitchen");
  });
  it("sin rol con Inicio manda al login", () => {
    expect(resolvePanelRedirect({ role: "X", roles: [] }, "/orders")).toBe("/login");
  });
});
