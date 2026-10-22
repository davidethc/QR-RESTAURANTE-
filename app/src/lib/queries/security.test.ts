import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), staff: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/queries/staff", () => ({ getMyRestaurant: mocks.session, getRestaurantStaff: mocks.staff }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { getSecurityHistory, getSecurityOrder } from "./security";
import type { SecurityFilters } from "@/lib/security-history";
const filters: SecurityFilters = { from: "2026-10-20", to: "2026-10-21", action: "order_cancelled", member: "11111111-1111-4111-8111-111111111111", page: 1 };
type Reply = { data: unknown[] | null; error: unknown };
function setup(replies: Reply[]) {
  const calls: { table: string; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; gte: ReturnType<typeof vi.fn>; lt: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => {
    const query = { table, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn(async () => replies.shift()), maybeSingle: vi.fn(async () => replies.shift()) };
    calls.push(query);
    return query;
  });
  mocks.client.mockResolvedValue({ from });
  return { calls, from };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: "OWNER", restaurant: { id: "monky-qa" } });
  mocks.staff.mockResolvedValue([{ user_id: "member", full_name: "Ana" }]);
});
describe("consulta de seguridad: solo lectura y scope de sesión", () => {
  it("repite restaurante, fechas, acción y miembro en índice y detalle; omite metadata", async () => {
    const row = { id: "event-1", group_key: "bill-1", created_at: "2026-10-20T12:00:00Z", restaurant_id: "monky-qa" };
    const { calls } = setup([{ data: [row], error: null }, { data: [row], error: null }]);
    const result = await getSecurityHistory(filters);
    expect(result.total).toBe(1);
    expect(result.members).toEqual([{ id: "member", name: "Ana" }]);
    for (const query of calls) {
      expect(query.table).toBe("security_events");
      expect(query.eq).toHaveBeenCalledWith("restaurant_id", "monky-qa");
      expect(query.eq).toHaveBeenCalledWith("actor_user_id", filters.member);
      expect(query.eq).toHaveBeenCalledWith("event_type", filters.action);
      expect(query.gte).toHaveBeenCalledWith("created_at", "2026-10-20T05:00:00.000Z");
      expect(query.lt).toHaveBeenCalledWith("created_at", expect.any(String));
      expect(query.select.mock.calls[0][0]).not.toContain("metadata");
    }
    expect(calls[1].in).toHaveBeenCalledWith("group_key", ["bill-1"]);
    expect(mocks.staff).toHaveBeenCalledWith("monky-qa");
  });
  it.each(["WAITER", "KITCHEN"])("%s no consulta vista, pedidos ni miembros", async (role) => {
    mocks.session.mockResolvedValue({ role, restaurant: { id: "monky-qa" } });
    await expect(getSecurityHistory(filters)).rejects.toThrow("No autorizado");
    await expect(getSecurityOrder("order")).rejects.toThrow("No autorizado");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.staff).not.toHaveBeenCalled();
  });
  it("vista sin aplicar se propaga al estado de error; no se presenta como vacío", async () => {
    const error = { code: "PGRST205", message: "security_events missing" };
    setup([{ data: null, error }]);
    await expect(getSecurityHistory(filters)).rejects.toBe(error);
    expect(mocks.staff).not.toHaveBeenCalled();
  });
  it("índice vacío no pide detalles", async () => {
    const { calls } = setup([{ data: [], error: null }]);
    expect(await getSecurityHistory(filters)).toMatchObject({ total: 0, page: 1, groups: [] });
    expect(calls).toHaveLength(1);
  });
  it("lee más de un bloque y no corta un grupo con más de 500 eventos", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({ id: `e-${index}`, group_key: "one-account", created_at: "2026-10-20T12:00:00Z", restaurant_id: "monky-qa" }));
    const { calls } = setup([{ data: rows.slice(0, 500), error: null }, { data: rows.slice(500), error: null }, { data: rows.slice(0, 500), error: null }, { data: rows.slice(500), error: null }]);
    const result = await getSecurityHistory(filters);
    expect(result.total).toBe(1);
    expect(result.groups[0].events).toHaveLength(501);
    expect(calls[1].range).toHaveBeenCalledWith(500, 999);
    expect(calls[3].range).toHaveBeenCalledWith(500, 999);
  });
  it("enlace de pedido consulta el id dentro del restaurante actual", async () => {
    const { calls } = setup([{ data: null, error: null }]);
    expect(await getSecurityOrder("order-1")).toBeNull();
    expect(calls[0].eq.mock.calls).toEqual([["restaurant_id", "monky-qa"], ["id", "order-1"]]);
    expect(calls[0].table).toBe("orders");
  });
});
