import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { newRequestId } from "./request-id";

describe("newRequestId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("genera UUID v4 válidos y distintos", () => {
    const a = newRequestId();
    expect(z.uuid().safeParse(a).success).toBe(true);
    expect(newRequestId()).not.toBe(a);
  });

  it("funciona sin crypto.randomUUID (http en la red local)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const id = newRequestId();
    expect(z.uuidv4().safeParse(id).success).toBe(true);
  });
});
