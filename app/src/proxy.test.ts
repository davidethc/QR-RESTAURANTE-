import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const mocks = vi.hoisted(() => ({ read: vi.fn(), claims: vi.fn(), device: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ checkDevice: mocks.device }));
vi.mock("@/lib/auth/member-session", () => ({ readMemberSession: mocks.read }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: mocks.claims, signOut: mocks.signOut } }) }));

beforeEach(() => {
  mocks.read.mockReset();
  mocks.device.mockReset();
  mocks.signOut.mockReset();
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

describe("proxy: dispositivos vinculados (M10)", () => {
  const withCookie = (path: string) =>
    new NextRequest(`https://example.com${path}`, { headers: { cookie: `monky_device=${"c".repeat(64)}` } });
  it("dispositivo revocado: cierra sesión, borra la cookie y manda a /pin", async () => {
    mocks.device.mockResolvedValue({ state: "revoked" });
    const response = await proxy(withCookie("/orders"));
    expect(mocks.signOut).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://example.com/pin?motivo=revocado");
    expect(response.headers.get("set-cookie")).toContain("monky_device=;");
  });
  it("dispositivo válido o no verificable no corta la sesión", async () => {
    mocks.read.mockResolvedValue({ role: "WAITER", roles: ["WAITER"] });
    for (const state of [{ state: "valid" }, { state: "unavailable" }]) {
      mocks.device.mockResolvedValue(state);
      expect((await proxy(withCookie("/orders"))).headers.get("location")).toBeNull();
    }
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("sin cookie no consulta dispositivos", async () => {
    mocks.read.mockResolvedValue({ role: "WAITER", roles: ["WAITER"] });
    await proxy(request("/orders"));
    expect(mocks.device).not.toHaveBeenCalled();
  });
});
