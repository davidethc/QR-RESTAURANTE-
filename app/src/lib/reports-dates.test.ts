import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rangeForPreset } from "./reports-dates";

const TZ = "America/Guayaquil";
const CUTOFF = "04:00:00";

describe("rangeForPreset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-03-15 12:00 in Guayaquil (UTC-5).
    vi.setSystemTime(new Date("2026-03-15T17:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("keeps the existing presets", () => {
    expect(rangeForPreset("today", TZ, CUTOFF)).toEqual({ from: "2026-03-15", to: "2026-03-15" });
    expect(rangeForPreset("yesterday", TZ, CUTOFF)).toEqual({ from: "2026-03-14", to: "2026-03-14" });
    expect(rangeForPreset("last7", TZ, CUTOFF)).toEqual({ from: "2026-03-09", to: "2026-03-15" });
    expect(rangeForPreset("thisMonth", TZ, CUTOFF)).toEqual({ from: "2026-03-01", to: "2026-03-15" });
  });

  it("last 30 days ends today", () => {
    expect(rangeForPreset("last30", TZ, CUTOFF)).toEqual({ from: "2026-02-14", to: "2026-03-15" });
  });

  it("previous month is the whole calendar month before this one", () => {
    expect(rangeForPreset("lastMonth", TZ, CUTOFF)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("previous 6 months are the six whole months before this one", () => {
    expect(rangeForPreset("last6Months", TZ, CUTOFF)).toEqual({ from: "2025-09-01", to: "2026-02-28" });
  });

  it("before the cutoff the business day is still yesterday", () => {
    vi.setSystemTime(new Date("2026-03-01T08:00:00Z")); // 03:00 local, before 04:00
    expect(rangeForPreset("today", TZ, CUTOFF)).toEqual({ from: "2026-02-28", to: "2026-02-28" });
    expect(rangeForPreset("lastMonth", TZ, CUTOFF)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });
});
