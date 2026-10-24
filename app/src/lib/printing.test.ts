import { describe, expect, it } from "vitest";
import {
  customerFontPx,
  groupKitchenOptions,
  hasPromo,
  isDraftDirty,
  kitchenFontPx,
  linePromoDiscount,
  textLines,
  ticketTitle,
  toDraft,
  validateDraft,
  formatTicketTime,
  formatTicketDateTime,
} from "./printing";

const base = toDraft({
  customer_ticket_font_size: "normal",
  customer_ticket_header: null,
  customer_ticket_footer: "Gracias",
  kitchen_ticket_font_size: "large",
});

describe("font sizes", () => {
  it("scales small < normal < large for both tickets", () => {
    expect(customerFontPx("small")).toBeLessThan(customerFontPx("normal"));
    expect(customerFontPx("normal")).toBeLessThan(customerFontPx("large"));
    expect(kitchenFontPx("small")).toBeLessThan(kitchenFontPx("large"));
  });
  it("kitchen text is larger than customer text at the same setting", () => {
    expect(kitchenFontPx("normal")).toBeGreaterThan(customerFontPx("normal"));
  });
});

describe("draft", () => {
  it("maps null texts to empty strings", () => {
    expect(base.customer_ticket_header).toBe("");
    expect(base.customer_ticket_footer).toBe("Gracias");
  });
  it("is not dirty when only whitespace differs", () => {
    expect(isDraftDirty(base, { ...base, customer_ticket_footer: "  Gracias  " })).toBe(false);
  });
  it("is dirty when a font size or text changes", () => {
    expect(isDraftDirty(base, { ...base, kitchen_ticket_font_size: "small" })).toBe(true);
    expect(isDraftDirty(base, { ...base, customer_ticket_header: "Hola" })).toBe(true);
  });
  it("rejects texts over 200 characters", () => {
    expect(validateDraft(base)).toBeNull();
    const errors = validateDraft({ ...base, customer_ticket_header: "x".repeat(201) });
    expect(errors?.customer_ticket_header).toMatch(/200/);
  });
});

describe("textLines", () => {
  it("splits, trims and drops blank lines", () => {
    expect(textLines("  Av. 1  \n\n Tel 2\r\n")).toEqual(["Av. 1", "Tel 2"]);
    expect(textLines(null)).toEqual([]);
  });
});

describe("groupKitchenOptions", () => {
  it("groups modifiers by group keeping order and quantities", () => {
    expect(
      groupKitchenOptions([
        { group: "PUNTO", name: "Término medio", qty: 1 },
        { group: "EXTRAS", name: "Queso", qty: 2 },
        { group: "EXTRAS", name: "Tocino", qty: null },
        { group: null, name: null, qty: null },
      ])
    ).toEqual([
      { group: "PUNTO", values: ["Término medio"] },
      { group: "EXTRAS", values: ["2 × Queso", "Tocino"] },
    ]);
  });
});

describe("promo fields", () => {
  it("reads the discount as returned and ignores missing values", () => {
    expect(linePromoDiscount({ promo_discount: 2.75 })).toBe(2.75);
    expect(linePromoDiscount({})).toBe(0);
    expect(linePromoDiscount({ promo_discount: null })).toBe(0);
  });
  it("shows the promo only with a discount and a list subtotal", () => {
    expect(hasPromo({ promo_discount: 0.5, list_subtotal: 5 })).toBe(true);
    expect(hasPromo({ promo_discount: 0.5 })).toBe(false);
    expect(hasPromo({ promo_discount: 0, list_subtotal: 5 })).toBe(false);
  });
});

describe("ticketTitle", () => {
  it("is a pre-account only while the bill is open", () => {
    expect(ticketTitle("OPEN")).toBe("PRE-CUENTA");
    expect(ticketTitle("PAID")).toBe("TICKET");
    expect(ticketTitle("CLOSED")).toBe("TICKET");
  });
});

describe("date formatting", () => {
  it("uses the restaurant timezone", () => {
    const iso = "2026-09-29T20:02:00Z";
    expect(formatTicketTime(iso, "America/Guayaquil")).toBe("15:02");
    expect(formatTicketDateTime(iso, "America/Guayaquil")).toContain("2026");
  });
  it("returns empty text for invalid dates", () => {
    expect(formatTicketTime("nope", "America/Guayaquil")).toBe("");
    expect(formatTicketDateTime("nope", "America/Guayaquil")).toBe("");
  });
});
