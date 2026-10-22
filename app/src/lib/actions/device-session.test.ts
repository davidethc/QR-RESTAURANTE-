import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), has: vi.fn() },
  pinLogin: vi.fn(),
  activate: vi.fn(),
  mint: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.jar }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }) }));
vi.mock("@/lib/devices/service", () => {
  class MissingServiceKeyError extends Error {}
  return {
    MissingServiceKeyError,
    pinLogin: mocks.pinLogin,
    activateDevice: mocks.activate,
    mintLoginTokenHash: mocks.mint,
  };
});
import { activateDeviceAction, pinLoginAction } from "./device-session";
import { MissingServiceKeyError } from "@/lib/devices/service";

const secret = "b".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.jar.get.mockReturnValue({ value: secret });
});

describe("pinLoginAction", () => {
  it("sin cookie de dispositivo rechaza sin llamar a la base", async () => {
    mocks.jar.get.mockReturnValue(undefined);
    const r = await pinLoginAction("1234");
    expect(r.ok).toBe(false);
    expect(mocks.pinLogin).not.toHaveBeenCalled();
  });
  it("PIN mal formado ni llega a la base", async () => {
    expect((await pinLoginAction("12")).ok).toBe(false);
    expect(mocks.pinLogin).not.toHaveBeenCalled();
  });
  it("LOCKED llega como mensaje amable con su código", async () => {
    mocks.pinLogin.mockResolvedValue({ data: { status: "LOCKED" }, error: null });
    const r = await pinLoginAction("1234");
    expect(r).toMatchObject({ ok: false, code: "LOCKED" });
    expect(!r.ok && r.error).toMatch(/Demasiados intentos/);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("dispositivo revocado borra la cookie", async () => {
    mocks.pinLogin.mockResolvedValue({ data: { status: "DEVICE_INVALID" }, error: null });
    await pinLoginAction("1234");
    expect(mocks.jar.delete).toHaveBeenCalledWith("monky_device");
  });
  it("éxito: canjea el hash en el cliente SSR y nunca devuelve secretos", async () => {
    mocks.pinLogin.mockResolvedValue({ data: { status: "OK", user_id: "u1" }, error: null });
    mocks.mint.mockResolvedValue("hash-1");
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const r = await pinLoginAction("1234");
    expect(r.ok).toBe(true);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hash-1" });
    expect(JSON.stringify(r)).not.toContain("hash-1");
  });
  it("sin SUPABASE_SECRET_KEY da un error claro", async () => {
    mocks.pinLogin.mockRejectedValue(new MissingServiceKeyError());
    const r = await pinLoginAction("1234");
    expect(!r.ok && r.error).toMatch(/SUPABASE_SECRET_KEY/);
  });
  it("no registra el PIN en logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.pinLogin.mockRejectedValue(new Error("boom"));
    await pinLoginAction("9876");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("9876");
  });
});

describe("activateDeviceAction", () => {
  const input = { token: "a".repeat(64), name: "Caja" };
  it("guarda el secreto en cookie httpOnly/Strict", async () => {
    mocks.activate.mockResolvedValue({ data: { device_secret: secret }, error: null });
    const r = await activateDeviceAction(input);
    expect(r.ok).toBe(true);
    expect(mocks.jar.set).toHaveBeenCalledWith(
      "monky_device",
      secret,
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/" })
    );
  });
  it("enlace vencido muestra el texto de la base y no pone cookie", async () => {
    mocks.activate.mockResolvedValue({ data: null, error: { code: "P0001", message: "El enlace no es válido o ya venció" } });
    const r = await activateDeviceAction(input);
    expect(!r.ok && r.error).toBe("El enlace no es válido o ya venció");
    expect(mocks.jar.set).not.toHaveBeenCalled();
  });
});
