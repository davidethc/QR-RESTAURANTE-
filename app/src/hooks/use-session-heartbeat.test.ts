import { describe, expect, it, vi } from "vitest";
import { checkSessionHeartbeat, HEARTBEAT_PATH } from "./use-session-heartbeat";

function fakeFetch(res: Partial<Response> | Error) {
  return vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res as Response;
  }) as unknown as typeof fetch;
}

describe("checkSessionHeartbeat", () => {
  it("devuelve el destino cuando el proxy redirige por dispositivo revocado", async () => {
    const fetchFn = fakeFetch({ redirected: true, url: "https://app.test/pin?motivo=revocado" });
    await expect(checkSessionHeartbeat(fetchFn)).resolves.toBe("/pin?motivo=revocado");
    expect(fetchFn).toHaveBeenCalledWith(HEARTBEAT_PATH, expect.objectContaining({ cache: "no-store" }));
  });

  it("devuelve /login cuando la sesión venció", async () => {
    const fetchFn = fakeFetch({ redirected: true, url: "https://app.test/login" });
    await expect(checkSessionHeartbeat(fetchFn)).resolves.toBe("/login");
  });

  it("no redirige si la sesión sigue valiendo", async () => {
    const fetchFn = fakeFetch({ redirected: false, url: `https://app.test${HEARTBEAT_PATH}` });
    await expect(checkSessionHeartbeat(fetchFn)).resolves.toBeNull();
  });

  it("no corta a nadie si no hay red", async () => {
    await expect(checkSessionHeartbeat(fakeFetch(new TypeError("offline")))).resolves.toBeNull();
  });
});
