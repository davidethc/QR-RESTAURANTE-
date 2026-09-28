import { afterEach, describe, expect, it, vi } from "vitest";
import { dbFailure, GENERIC_DB_ERROR, userFacingDbError } from "./db-errors";
import { classifyMyRestaurantError } from "./my-restaurant-error";

describe("userFacingDbError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deja pasar el mensaje de un RAISE EXCEPTION (P0001) sin registrarlo", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userFacingDbError({ code: "P0001", message: "La mesa ya está cerrada" }, "ctx")).toBe(
      "La mesa ya está cerrada"
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("oculta cualquier otro código y lo registra con el contexto", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = 'duplicate key value violates unique constraint "orders_pkey"';
    expect(userFacingDbError({ code: "23505", message: raw }, "createOrder")).toBe(GENERIC_DB_ERROR);
    expect(log).toHaveBeenCalledWith("[createOrder]", "23505", raw);
  });

  it("trata un error sin código (red, PostgREST) como interno", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userFacingDbError({ message: "fetch failed" }, "ctx")).toBe(GENERIC_DB_ERROR);
  });

  it("usa el mensaje genérico propio cuando se pasa uno", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userFacingDbError({ code: "42P01", message: "x" }, "ctx", "No se pudo guardar.")).toBe(
      "No se pudo guardar."
    );
  });

  it("no deja pasar un P0001 vacío", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userFacingDbError({ code: "P0001", message: "" }, "ctx")).toBe(GENERIC_DB_ERROR);
  });

  it("dbFailure devuelve la forma de ActionResult", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(dbFailure({ code: "XX000", message: "boom" }, "ctx")).toEqual({
      ok: false,
      error: GENERIC_DB_ERROR,
    });
  });
});

describe("classifyMyRestaurantError", () => {
  it("sin sesión → unauthenticated", () => {
    expect(classifyMyRestaurantError({ code: "P0001", message: "No autenticado" })).toBe("unauthenticated");
    expect(classifyMyRestaurantError({ code: "PGRST301", message: "JWT expired" })).toBe("unauthenticated");
    expect(classifyMyRestaurantError({ code: "42501", message: "permission denied" })).toBe("unauthenticated");
  });

  it("sin restaurante activo → no-restaurant", () => {
    expect(
      classifyMyRestaurantError({
        code: "P0001",
        message: "Tu cuenta no está asignada a ningún restaurante",
      })
    ).toBe("no-restaurant");
  });

  it("cualquier otra cosa es pasajera", () => {
    expect(classifyMyRestaurantError({ message: "fetch failed" })).toBe("transient");
    expect(classifyMyRestaurantError(new TypeError("network"))).toBe("transient");
    expect(classifyMyRestaurantError(undefined)).toBe("transient");
    expect(classifyMyRestaurantError({ code: "57014", message: "statement timeout" })).toBe("transient");
  });
});
