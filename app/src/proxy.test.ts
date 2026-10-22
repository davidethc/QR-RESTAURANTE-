import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { PANEL_PATH_HEADER } from "@/app/(dashboard)/_components/route-guard";

const mocks = vi.hoisted(() => ({ claims: vi.fn(), device: vi.fn(), signOut: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ checkDevice: mocks.device }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: mocks.claims, signOut: mocks.signOut },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

beforeEach(() => {
  mocks.device.mockReset();
  mocks.signOut.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.claims.mockReset().mockResolvedValue({ data: { claims: { sub: "user" } } });
});
const request = (path: string) => new NextRequest(`https://example.com${path}`);

describe("proxy: sesión y reparto de trabajo con el layout", () => {
  it("con sesión deja pasar y NO lee al miembro (eso lo hace el layout, una vez)", async () => {
    for (const path of ["/orders", "/cash", "/today?entrada=1", "/menu"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("le pasa al layout la ruta pedida con su query", async () => {
    const response = await proxy(request("/today?entrada=1"));
    // Las cabeceras reenviadas a la petición viajan como x-middleware-request-*.
    expect(response.headers.get(`x-middleware-request-${PANEL_PATH_HEADER}`)).toBe("/today?entrada=1");
  });
  it("pisa un valor inyectado por el cliente en esa cabecera", async () => {
    const forged = new NextRequest("https://example.com/orders", { headers: { [PANEL_PATH_HEADER]: "/anything" } });
    const response = await proxy(forged);
    expect(response.headers.get(`x-middleware-request-${PANEL_PATH_HEADER}`)).toBe("/orders");
  });
  it("sin autenticación va al login", async () => {
    mocks.claims.mockResolvedValue({ data: null });
    expect((await proxy(request("/cash"))).headers.get("location")).toBe("https://example.com/login");
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
    for (const state of [{ state: "valid" }, { state: "unavailable" }]) {
      mocks.device.mockResolvedValue(state);
      expect((await proxy(withCookie("/orders"))).headers.get("location")).toBeNull();
    }
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("sin cookie no consulta dispositivos", async () => {
    await proxy(request("/orders"));
    expect(mocks.device).not.toHaveBeenCalled();
  });
});
