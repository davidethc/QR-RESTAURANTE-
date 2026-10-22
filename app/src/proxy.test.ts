import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const mocks = vi.hoisted(() => ({ read: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/auth/member-session", () => ({ readMemberSession: mocks.read }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: mocks.claims } }) }));

beforeEach(() => {
  mocks.read.mockReset();
  mocks.claims.mockReset().mockResolvedValue({ data: { claims: { sub: "user" } } });
});
const request = (path: string) => new NextRequest(`https://example.com${path}`);

describe("proxy: navegación silenciosa con roles combinados", () => {
  it.each([["WAITER", "/tables"], ["CASHIER", "/orders"], ["KITCHEN", "/kitchen"], ["ADMIN", "/today"]])("entrada %s → %s sin conservar la marca de entrada", async (role, expected) => {
    mocks.read.mockResolvedValue({ role: "WAITER", roles: [role] });
    const response = await proxy(request("/today?entrada=1"));
    expect(response.headers.get("location")).toBe(`https://example.com${expected}`);
  });
  it("niega URL directa antes de renderizar y no expone un error", async () => {
    mocks.read.mockResolvedValue({ role: "ADMIN", roles: ["KITCHEN"] });
    const response = await proxy(request("/menu?private=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/today");
  });
  it("permite el segundo rol y permite Inicio fuera de la entrada", async () => {
    mocks.read.mockResolvedValue({ role: "WAITER", roles: ["WAITER", "CASHIER"] });
    expect((await proxy(request("/orders"))).headers.get("location")).toBeNull();
    expect((await proxy(request("/today"))).headers.get("location")).toBeNull();
  });
  it("sin autenticación va al login sin consultar miembros", async () => {
    mocks.claims.mockResolvedValue({ data: null });
    expect((await proxy(request("/cash"))).headers.get("location")).toBe("https://example.com/login");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("un fallo transitorio se delega a los guards y al estado recuperable del layout", async () => {
    mocks.read.mockRejectedValue(new Error("fetch failed"));
    expect((await proxy(request("/cash"))).headers.get("location")).toBeNull();
  });
  it("mesero entra a /orders pero no a caja, ventas, reportes, personal ni ajustes", async () => {
    mocks.read.mockResolvedValue({ role: "WAITER", roles: ["WAITER"] });
    expect((await proxy(request("/orders"))).headers.get("location")).toBeNull();
    for (const path of ["/cash", "/sales", "/reports", "/staff", "/settings"]) {
      expect((await proxy(request(path))).headers.get("location")).toBe("https://example.com/today");
    }
  });
  it("cocina no entra a /orders", async () => {
    mocks.read.mockResolvedValue({ role: "KITCHEN", roles: ["KITCHEN"] });
    expect((await proxy(request("/orders"))).headers.get("location")).toBe("https://example.com/kitchen");
  });
});
