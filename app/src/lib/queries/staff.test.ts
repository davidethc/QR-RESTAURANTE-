import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { getRestaurantStaff } from "./staff";

const restaurantId = "restaurant-1";
const row = { member_id: "member-1", user_id: "user-1", full_name: "Ana Pérez", email: "ana@example.com", role: "WAITER", status: "ACTIVE", created_at: "2026-10-21", is_me: false, can_manage: true };
function setup({ staff = [row], rpcError = null as unknown, pin = [{ member_id: row.member_id, has_pin: true }] as unknown[] | null, pinError = null as unknown, details = [{ id: row.member_id, roles: ["WAITER", "CASHIER"], cash_register_ids: ["register-1"] }], detailsError = null as unknown } = {}) {
  mocks.rpc.mockImplementation(async (name: string) => name === "get_staff_pin_status"
    ? { data: pin, error: pinError } : { data: staff, error: rpcError });
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: details, error: detailsError }),
  };
  mocks.from.mockReturnValue(query);
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  return query;
}
beforeEach(() => vi.clearAllMocks());

describe("getRestaurantStaff: campos de edición M00-T04", () => {
  it("enriquece filas tras autorizar, conservando los datos y permisos legacy", async () => {
    const query = setup();
    const result = await getRestaurantStaff(restaurantId);
    expect(result).toEqual([{ ...row, roles: ["WAITER", "CASHIER"], cash_register_ids: ["register-1"], has_pin: true }]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_staff_pin_status", { p_restaurant_id: restaurantId });
    expect(mocks.rpc).toHaveBeenCalledWith("get_restaurant_staff", { p_restaurant_id: restaurantId });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.from.mock.invocationCallOrder[0]);
    expect(mocks.from).toHaveBeenCalledWith("restaurant_members");
    expect(query.select).toHaveBeenCalledWith("id, roles, cash_register_ids");
    expect(query.eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(query.in).toHaveBeenCalledWith("id", [row.member_id]);
    expect(result[0]).not.toHaveProperty("pin_hash");
  });
  it("una denegación de la RPC no permite consultar los nuevos campos", async () => {
    const error = { code: "P0001", message: "No autorizado" };
    setup({ rpcError: error });
    await expect(getRestaurantStaff(restaurantId)).rejects.toBe(error);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("lista vacía no consulta miembros ni el PIN", async () => {
    setup({ staff: [] });
    expect(await getRestaurantStaff(restaurantId)).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_staff_pin_status", expect.anything());
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("une por id sin depender del orden de respuesta", async () => {
    const other = { ...row, member_id: "member-2", full_name: "Luis" };
    setup({ staff: [row, other], details: [
      { id: other.member_id, roles: ["KITCHEN"], cash_register_ids: [] },
      { id: row.member_id, roles: [], cash_register_ids: [] },
    ] });
    const result = await getRestaurantStaff(restaurantId);
    expect(result.map((member) => [member.member_id, member.roles, member.cash_register_ids])).toEqual([
      [row.member_id, [], []], [other.member_id, ["KITCHEN"], []],
    ]);
  });
  it("fallos de lectura no se ocultan con datos vacíos", async () => {
    const error = { code: "42501", message: "No autorizado" };
    setup({ detailsError: error });
    await expect(getRestaurantStaff(restaurantId)).rejects.toBe(error);
  });
  it("has_pin se une por member_id; sin fila equivale a sin PIN", async () => {
    const other = { ...row, member_id: "member-2" };
    setup({ staff: [row, other], pin: [{ member_id: other.member_id, has_pin: true }],
      details: [{ id: row.member_id, roles: [], cash_register_ids: [] }, { id: other.member_id, roles: [], cash_register_ids: [] }] });
    expect((await getRestaurantStaff(restaurantId)).map((m) => [m.member_id, m.has_pin])).toEqual([[row.member_id, false], [other.member_id, true]]);
  });
  it("si falla get_staff_pin_status se lanza el error, no se infiere false", async () => {
    const error = { code: "42501", message: "No autorizado" };
    setup({ pin: null, pinError: error });
    await expect(getRestaurantStaff(restaurantId)).rejects.toBe(error);
  });
  it("miembro retirado durante la consulta exige recargar", async () => {
    setup({ details: [] });
    await expect(getRestaurantStaff(restaurantId)).rejects.toThrow("Recarga Personal");
  });
});
