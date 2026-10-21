import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { readMemberSession } from "./member-session";

const session = { user: { id: "user-1" }, role: "WAITER", restaurant: { id: "restaurant-1" } };
function client(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  const rpc = vi.fn().mockResolvedValue({ data: session, error: null });
  const from = vi.fn().mockReturnValue(query);
  return { supabase: { rpc, from } as unknown as SupabaseClient<Database>, query, rpc, from };
}

describe("permisos desde el miembro activo de la sucursal elegida", () => {
  it("lee roles y cajas explícitos, sin PIN ni metadatos del usuario", async () => {
    const { supabase, query, from } = client({ data: { roles: ["WAITER", "CASHIER"], cash_register_ids: ["register-1"] }, error: null });
    const result = await readMemberSession(supabase);
    expect(result.roles).toEqual(["WAITER", "CASHIER"]);
    expect(from).toHaveBeenCalledWith("restaurant_members");
    expect(query.select).toHaveBeenCalledWith("roles, cash_register_ids");
    expect(query.eq.mock.calls).toEqual([["restaurant_id", "restaurant-1"], ["user_id", "user-1"], ["status", "ACTIVE"]]);
  });
  it.each(["42703", "PGRST204"])("columna todavía ausente (%s): mantiene legacy", async (code) => {
    const { supabase } = client({ data: null, error: { code } });
    expect(await readMemberSession(supabase)).toEqual(session);
  });
  it("roles vacío se conserva sin recuperar permisos legacy", async () => {
    const { supabase } = client({ data: { roles: [], cash_register_ids: [] }, error: null });
    expect((await readMemberSession(supabase)).roles).toEqual([]);
  });
  it.each(["42501", "fetch-failed"])("no recupera legacy ante fallo %s", async (code) => {
    const error = { code };
    const { supabase } = client({ data: null, error });
    await expect(readMemberSession(supabase)).rejects.toBe(error);
  });
  it("miembro desactivado o ausente no recupera acceso", async () => {
    const { supabase } = client({ data: null, error: null });
    await expect(readMemberSession(supabase)).rejects.toThrow("no está asignada");
  });
  it("fallo del RPC no dispara una consulta sin sucursal", async () => {
    const { supabase, rpc, from } = client({ data: null, error: null });
    const error = { code: "42501" };
    rpc.mockResolvedValue({ data: null, error });
    await expect(readMemberSession(supabase)).rejects.toBe(error);
    expect(from).not.toHaveBeenCalled();
  });
});
