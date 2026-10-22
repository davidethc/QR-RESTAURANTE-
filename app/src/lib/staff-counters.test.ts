import { describe, expect, it } from "vitest";
import { EMPTY_COUNTERS, formatBadge, navBadgeFor, parseStaffCounters } from "./staff-counters";

describe("parseStaffCounters", () => {
  it("lee el JSON de la RPC y descarta basura", () => {
    const c = parseStaffCounters({
      active_tables: 3,
      bill_requested: "2",
      waiter_requested: -1,
      unreviewed_tickets: null,
      tickets_to_prepare: 4.9,
      server_time: "x",
    });
    expect(c).toEqual({ ...EMPTY_COUNTERS, active_tables: 3, bill_requested: 2, tickets_to_prepare: 4 });
  });
  it("tolera null", () => {
    expect(parseStaffCounters(null)).toEqual(EMPTY_COUNTERS);
  });
});

describe("navBadgeFor", () => {
  const c = { ...EMPTY_COUNTERS, bill_requested: 1, waiter_requested: 2, unreviewed_tickets: 3, unreviewed_orders: 4, tickets_to_prepare: 5 };
  it("suma por ruta", () => {
    expect(navBadgeFor("/tables", c)).toBe(6);
    expect(navBadgeFor("/orders", c)).toBe(7);
    expect(navBadgeFor("/kitchen", c)).toBe(5);
    expect(navBadgeFor("/cash", c)).toBe(0);
  });
});

describe("formatBadge", () => {
  it("topa en 99+", () => {
    expect(formatBadge(7)).toBe("7");
    expect(formatBadge(100)).toBe("99+");
  });
});
