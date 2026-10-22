import { describe, expect, it } from "vitest";
import { defaultSecurityFilters, filterSecurityEvents, groupSecurityEvents, paginateSecurityGroups, parseSecurityFilters, securityDateBounds, securityEventOrderHref, securityHistoryHref, type SecurityEvent, type SecurityFilters } from "./security-history";

const member = "11111111-1111-4111-8111-111111111111";
const order = "22222222-2222-4222-8222-222222222222";
const filters: SecurityFilters = { from: "2026-10-20", to: "2026-10-21", action: "", member: "", page: 1 };
function event(patch: Partial<SecurityEvent> = {}): SecurityEvent {
  return { id: "a", group_key: "account-a", restaurant_id: "qa", created_at: "2026-10-20T12:00:00.000Z", actor_user_id: member, action: "REJECT_ORDER", event_type: "order_cancelled", entity_type: "ORDER", entity_id: order, amount: null, cash_movement_type: null, cash_movement_reason: null, cash_difference: null, reason: null, metadata: null, ...patch };
}
describe("fechas y filtros del historial", () => {
  it("inicia con siete fechas de Ecuador aunque UTC esté en el día siguiente", () => {
    expect(defaultSecurityFilters(new Date("2026-10-22T02:00:00Z"))).toMatchObject({ from: "2026-10-15", to: "2026-10-21" });
    expect(securityDateBounds(filters)).toEqual({ from: "2026-10-20T05:00:00.000Z", until: "2026-10-22T05:00:00.000Z" });
  });
  it("rango inclusivo por fecha, exclusiva la medianoche siguiente, sin fugas entre restaurantes", () => {
    const events = [event({ id: "before", created_at: "2026-10-20T04:59:59Z" }), event({ id: "start", created_at: "2026-10-20T05:00:00+00:00" }), event({ id: "last", created_at: "2026-10-22T04:59:59.999Z" }), event({ id: "after", created_at: "2026-10-22T05:00:00Z" }), event({ id: "foreign", restaurant_id: "other" })];
    expect(filterSecurityEvents(events, "qa", filters).map((row) => row.id)).toEqual(["start", "last"]);
  });
  it("combina acción y miembro antes de agrupar", () => {
    const events = [event(), event({ id: "b", event_type: "bill_voided" }), event({ id: "c", actor_user_id: null }), event({ id: "d", actor_user_id: order })];
    expect(filterSecurityEvents(events, "qa", { ...filters, action: "order_cancelled", member })).toEqual([events[0]]);
    expect(filterSecurityEvents(events, "qa", filters)).toHaveLength(4);
  });
  it.each([{ from: "2026-02-30" }, { from: "2026-10-22" }, { action: "DROP TABLE" }, { member: "someone" }, { page: "0" }, { page: "1.5" }, { action: ["discount", "refund"] }])("rechaza parámetros inválidos %j", (params) => {
    expect(() => parseSecurityFilters(params, filters)).toThrow();
  });
  it("normaliza página y preserva filtros en la paginación", () => {
    const parsed = parseSecurityFilters({ action: "discount", member, page: "2" }, filters);
    const href = new URL(securityHistoryHref(parsed, 3), "https://example.com");
    expect(href.pathname).toBe("/security");
    expect(href.searchParams.get("page")).toBe("3");
    expect(href.searchParams.get("member")).toBe(member);
    expect(href.searchParams.get("action")).toBe("discount");
    expect(href.searchParams.get("from")).toBe(filters.from);
  });
});
describe("agrupado y paginación por group_key", () => {
  it("une una cuenta anulada y sus pedidos, aun separados en el índice", () => {
    const events = [event(), event({ id: "b", group_key: "other", created_at: "2026-10-20T13:00:00Z" }), event({ id: "c", action: "VOID_BILL", event_type: "bill_voided", created_at: "2026-10-20T14:00:00Z" })];
    const groups = groupSecurityEvents(events);
    expect(groups.map((group) => [group.key, group.events.map((row) => row.id)])).toEqual([["account-a", ["c", "a"]], ["other", ["b"]]]);
    expect(paginateSecurityGroups(events, 1, 1)).toMatchObject({ keys: ["account-a"], total: 2, pages: 2 });
    expect(paginateSecurityGroups(events, 2, 1).keys).toEqual(["other"]);
  });
  it("no mezcla restaurantes aunque compartan group_key", () => {
    expect(groupSecurityEvents([event(), event({ id: "b", restaurant_id: "other" })])).toHaveLength(2);
  });
  it("ordena empates de fecha por id y no muta la entrada", () => {
    const events = [event(), event({ id: "b", group_key: "other" })];
    expect(groupSecurityEvents(events)[0].key).toBe("other");
    expect(events[0].id).toBe("a");
    expect(paginateSecurityGroups(events, 1, 1).keys).toEqual(["other"]);
  });
  it("no cuenta dos veces el mismo grupo, ajusta páginas fuera de rango y admite vacío", () => {
    expect(paginateSecurityGroups([event(), event({ id: "b" })], 999)).toMatchObject({ page: 1, pages: 1, total: 1 });
    expect(paginateSecurityGroups([], 999)).toEqual({ page: 1, pages: 1, total: 0, keys: [] });
  });
  it("15 grupos por página sin partir un grupo con muchos eventos", () => {
    const events = Array.from({ length: 20 }, (_, index) => event({ id: String(index).padStart(3, "0"), group_key: `g-${index}` }));
    events.push(...Array.from({ length: 18 }, (_, index) => event({ id: `z-${index}`, group_key: "g-19" })));
    const first = paginateSecurityGroups(events, 1);
    const second = paginateSecurityGroups(events, 2);
    expect(first.keys).toHaveLength(15);
    expect(second.keys).toHaveLength(5);
    expect(first.keys.filter((key) => second.keys.includes(key))).toEqual([]);
  });
  it("enlaza pedidos cancelados con un detalle real; no fabrica enlaces con metadata", () => {
    expect(securityEventOrderHref(event())).toBe(`/security/orders/${order}`);
    expect(securityEventOrderHref(event({ entity_type: "BILL" }))).toBeNull();
    expect(securityEventOrderHref(event({ entity_id: "javascript:bad" }))).toBeNull();
    expect(securityEventOrderHref(event({ entity_id: null }))).toBeNull();
  });
});
