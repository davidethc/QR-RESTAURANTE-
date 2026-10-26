import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupByServiceOption, parseDashboardRange } from "./home-dashboard";

const TZ = "America/Guayaquil";
const CUTOFF = "04:00:00";

describe("parseDashboardRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T17:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to today", () => {
    expect(parseDashboardRange({}, TZ, CUTOFF)).toEqual({ range: { from: "2026-03-15", to: "2026-03-15" }, preset: "today" });
  });

  it("uses a known preset", () => {
    expect(parseDashboardRange({ preset: "last30" }, TZ, CUTOFF)).toEqual({
      range: { from: "2026-02-14", to: "2026-03-15" },
      preset: "last30",
    });
  });

  it("accepts a valid custom range", () => {
    expect(parseDashboardRange({ preset: "custom", from: "2026-01-01", to: "2026-01-31" }, TZ, CUTOFF)).toEqual({
      range: { from: "2026-01-01", to: "2026-01-31" },
      preset: "custom",
    });
  });

  it("falls back to today for an inverted, malformed, too long or unknown range", () => {
    const today = { range: { from: "2026-03-15", to: "2026-03-15" }, preset: "today" };
    expect(parseDashboardRange({ preset: "custom", from: "2026-02-01", to: "2026-01-01" }, TZ, CUTOFF)).toEqual(today);
    expect(parseDashboardRange({ preset: "custom", from: "ayer", to: "2026-01-01" }, TZ, CUTOFF)).toEqual(today);
    expect(parseDashboardRange({ preset: "custom", from: "2024-01-01", to: "2026-01-01" }, TZ, CUTOFF)).toEqual(today);
    expect(parseDashboardRange({ preset: "forever" }, TZ, CUTOFF)).toEqual(today);
  });
});

describe("groupByServiceOption", () => {
  it("merges takeaway and pickup and sorts by total", () => {
    expect(
      groupByServiceOption([
        { service_type: "table", total: 10, pos: 10, digital: 0 },
        { service_type: "takeaway", total: 5, pos: 5, digital: 0 },
        { service_type: "pickup", total: 8, pos: 0, digital: 8 },
      ])
    ).toEqual([
      { label: "Para llevar o recoger", total: 13, pos: 5, digital: 8 },
      { label: "Mesas", total: 10, pos: 10, digital: 0 },
    ]);
  });
});
