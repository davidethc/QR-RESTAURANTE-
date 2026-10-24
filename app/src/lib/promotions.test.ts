import { describe, expect, it } from "vitest";
import {
  activationSummary,
  estimateCartLine,
  linePromoView,
  localToday,
  pickLinePromotions,
  productPromoBadge,
  promoLineDiscount,
  promotionDisplayStatus,
  promotionFormSchema,
  promotionLabel,
  promotionsForChannel,
  splitItemAmount,
  toPromotionPayload,
  weekdaysSummary,
  type PromotionForm,
} from "./promotions";
import type { ActivePromotion } from "@/types/promotions";

const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const ALL = {
  pos: { tables: true, dine_in_no_table: true, takeaway: true, delivery: true },
  digital_menu: { tables: true, pickup: true, delivery: true },
};

function promo(partial: Partial<ActivePromotion>): ActivePromotion {
  return {
    id: partial.id ?? "p",
    name: "Promo",
    type: "discount",
    value_type: "percent",
    value: 10,
    receive_qty: null,
    buy_qty: null,
    applies_to: "products",
    target_ids: [P1],
    service_options: ALL,
    label: "",
    ...partial,
  };
}
const tenPct = promo({ id: "pct", label: "-10%" });
const twoForOne = promo({ id: "bx", type: "buy_x_get_y", value_type: null, value: null, receive_qty: 2, buy_qty: 1, label: "2x1" });

describe("promotionLabel", () => {
  it("matches promotion_label", () => {
    expect(promotionLabel(tenPct)).toBe("-10%");
    expect(promotionLabel({ ...tenPct, value: 12.5 })).toBe("-12.5%");
    expect(promotionLabel({ ...tenPct, value_type: "fixed", value: 1.5 })).toBe("-$1.50");
    expect(promotionLabel(twoForOne)).toBe("2x1");
  });
});

describe("promotionsForChannel", () => {
  it("keeps only promotions enabled for the channel (same as promotion_channel_ok)", () => {
    const noTakeaway = promo({ id: "nt", service_options: { ...ALL, pos: { ...ALL.pos, takeaway: false } } });
    expect(promotionsForChannel([tenPct, noTakeaway], "pos.takeaway").map((p) => p.id)).toEqual(["pct"]);
    expect(promotionsForChannel([tenPct, noTakeaway], "pos.tables").map((p) => p.id)).toEqual(["pct", "nt"]);
  });
});

describe("promoLineDiscount (mirror of the server formula)", () => {
  it("reproduces M13 §11: 2 × $2.50 with 10% and 2x1 pays $2.25", () => {
    const d = promoLineDiscount(2.5, 2, [tenPct, twoForOne]);
    expect(d).toBe(2.75);
    expect(2.5 * 2 - d).toBe(2.25);
  });
  it("fixed discount never exceeds the variant price", () => {
    expect(promoLineDiscount(2, 3, [promo({ value_type: "fixed", value: 5 })])).toBe(6);
  });
  it("buy X get Y counts whole groups only", () => {
    expect(promoLineDiscount(3, 3, [twoForOne])).toBe(3);
    expect(promoLineDiscount(3, 1, [twoForOne])).toBe(0);
  });
  it("no rules or bad input gives 0", () => {
    expect(promoLineDiscount(2, 2, null)).toBe(0);
    expect(promoLineDiscount(0, 2, [tenPct])).toBe(0);
  });
});

describe("pickLinePromotions", () => {
  it("keeps the biggest benefit per type and matches categories", () => {
    const fivePct = promo({ id: "five", value: 5, applies_to: "categories", target_ids: [C1] });
    const fixed = promo({ id: "fixed", value_type: "fixed", value: 1 });
    const picked = pickLinePromotions(P1, C1, 4, 1, [fivePct, tenPct, fixed]);
    expect(picked.map((p) => p.id)).toEqual(["fixed"]);
  });
  it("ignores other products and a 2x1 with too few units", () => {
    expect(pickLinePromotions("other", null, 4, 1, [tenPct, twoForOne])).toEqual([]);
    expect(pickLinePromotions(P1, null, 4, 1, [twoForOne])).toEqual([]);
  });
});

describe("estimateCartLine", () => {
  it("discounts only the variant price, never the modifiers", () => {
    const e = estimateCartLine({ productId: P1, categoryId: null, variantPrice: 2.5, unitPrice: 3, quantity: 2 }, [tenPct, twoForOne]);
    expect(e).toEqual({ listSubtotal: 6, discount: 2.75, subtotal: 3.25, labels: ["2x1", "-10%"] });
  });
});

describe("productPromoBadge", () => {
  it("shows the net price for a discount and only the label for a 2x1", () => {
    expect(productPromoBadge(P1, null, 2.5, [tenPct])).toEqual({ labels: ["-10%"], netPrice: 2.25 });
    expect(productPromoBadge(P1, null, 2.5, [twoForOne])).toEqual({ labels: ["2x1"], netPrice: null });
    expect(productPromoBadge("other", null, 2.5, [tenPct])).toBeNull();
  });
});

describe("linePromoView", () => {
  it("reads bill_json promo fields", () => {
    const v = linePromoView({ quantity: 2, unit_price: 2.5, subtotal: 2.25, list_subtotal: 5, promo_discount: 2.75, promotions: [twoForOne, tenPct] });
    expect(v).toEqual({ hasPromo: true, listSubtotal: 5, discount: 2.75, labels: ["2x1", "-10%"] });
  });
  it("old lines without promo fields have no promo", () => {
    expect(linePromoView({ quantity: 2, unit_price: 3, subtotal: 6 })).toEqual({ hasPromo: false, listSubtotal: 6, discount: 0, labels: [] });
  });
});

describe("splitItemAmount (pay by item uses the net subtotal)", () => {
  it("without promo equals quantity × unit price", () => {
    expect(splitItemAmount({ subtotal: 6, quantity: 2 }, 0, 2)).toBe(6);
    expect(splitItemAmount({ subtotal: 6, quantity: 2 }, 0, 1)).toBe(3);
  });
  it("with promo charges the net amount, not the list price", () => {
    expect(splitItemAmount({ subtotal: 2.25, quantity: 2 }, 0, 2)).toBe(2.25);
  });
  it("the last unit absorbs the rounding so the parts add up to the subtotal", () => {
    const line = { subtotal: 10, quantity: 3 };
    const parts = [splitItemAmount(line, 0, 1), splitItemAmount(line, 1, 1), splitItemAmount(line, 2, 1)];
    expect(parts).toEqual([3.33, 3.34, 3.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10);
    expect(splitItemAmount(line, 2, 1) + splitItemAmount(line, 0, 2)).toBeCloseTo(10, 10);
  });
  it("never goes past the remaining units", () => {
    expect(splitItemAmount({ subtotal: 10, quantity: 3 }, 2, 5)).toBe(3.33);
    expect(splitItemAmount({ subtotal: 10, quantity: 3 }, 3, 1)).toBe(0);
  });
});

describe("status and summaries", () => {
  const today = { date: "2026-10-23", weekday: 5 };
  it("range end is inclusive; paused wins", () => {
    expect(promotionDisplayStatus({ status: "active", weekdays: null, starts_on: "2026-10-20", ends_on: "2026-10-23" }, today)).toBe("today");
    expect(promotionDisplayStatus({ status: "active", weekdays: null, starts_on: "2026-10-20", ends_on: "2026-10-22" }, today)).toBe("expired");
    expect(promotionDisplayStatus({ status: "active", weekdays: null, starts_on: "2026-10-24", ends_on: "2026-10-30" }, today)).toBe("scheduled");
    expect(promotionDisplayStatus({ status: "active", weekdays: [5, 6], starts_on: null, ends_on: null }, today)).toBe("today");
    expect(promotionDisplayStatus({ status: "active", weekdays: [6], starts_on: null, ends_on: null }, today)).toBe("scheduled");
    expect(promotionDisplayStatus({ status: "paused", weekdays: [5], starts_on: null, ends_on: null }, today)).toBe("paused");
  });
  it("summaries read naturally", () => {
    expect(weekdaysSummary([])).toBeNull();
    expect(weekdaysSummary([6, 5])).toBe("viernes y sábado");
    expect(weekdaysSummary([0, 1, 2, 3, 4, 5, 6])).toBe("todos los días");
    expect(activationSummary({ weekdays: [1, 0], starts_on: null, ends_on: null })).toBe("Cada lunes y domingo");
    expect(activationSummary({ weekdays: null, starts_on: "2026-10-24", ends_on: "2026-10-31" })).toBe("Del 24 oct 2026 al 31 oct 2026");
  });
  it("localToday uses the restaurant time zone across midnight", () => {
    const utc = new Date("2026-10-24T03:30:00Z");
    expect(localToday("America/Guayaquil", utc)).toEqual({ date: "2026-10-23", weekday: 5 });
    expect(localToday("UTC", utc)).toEqual({ date: "2026-10-24", weekday: 6 });
  });
});

describe("promotionFormSchema / toPromotionPayload", () => {
  const base: PromotionForm = {
    name: "QA Promo",
    type: "discount",
    value_type: "percent",
    value: 10,
    receive_qty: null,
    buy_qty: null,
    applies_to: "products",
    target_ids: [P1],
    activation: "weekdays",
    weekdays: [6, 5, 5],
    starts_on: null,
    ends_on: null,
    service_options: ALL,
    status: "active",
  };
  it("sends exactly one activation form", () => {
    const payload = toPromotionPayload(promotionFormSchema.parse(base));
    expect(payload).toEqual({
      name: "QA Promo", type: "discount", applies_to: "products", target_ids: [P1], service_options: ALL,
      status: "active", value_type: "percent", value: 10, weekdays: [5, 6],
    });
    const dated = toPromotionPayload(promotionFormSchema.parse({ ...base, activation: "dates", starts_on: "2026-10-24", ends_on: "2026-10-25" }));
    expect(dated).not.toHaveProperty("weekdays");
    expect(dated).toMatchObject({ starts_on: "2026-10-24", ends_on: "2026-10-25" });
  });
  it("rejects an empty day picker, bad ranges and 2x1 by dates", () => {
    const msg = (v: PromotionForm) => promotionFormSchema.safeParse(v).error?.issues.map((i) => i.message);
    expect(msg({ ...base, weekdays: [] })).toEqual(["Elige al menos un día"]);
    expect(msg({ ...base, activation: "dates", starts_on: "2026-10-25", ends_on: "2026-10-24" })).toEqual([
      "La fecha de fin no puede ser anterior a la de inicio",
    ]);
    expect(msg({ ...base, value: 120 })).toEqual(["Escribe un porcentaje entre 1 y 100"]);
    expect(msg({ ...base, value: 0.29, value_type: "fixed" })).toBeUndefined();
    expect(
      msg({ ...base, type: "buy_x_get_y", value_type: null, value: null, receive_qty: 2, buy_qty: 2, activation: "dates", starts_on: "2026-10-24", ends_on: "2026-10-24" })
    ).toEqual(["La cantidad que se paga debe ser menor que la que se lleva", "Compra X lleva Y solo se activa por días de la semana"]);
  });
  it("2x1 payload carries the quantities and no value", () => {
    const payload = toPromotionPayload(
      promotionFormSchema.parse({ ...base, type: "buy_x_get_y", value_type: null, value: null, receive_qty: 3, buy_qty: 2 })
    );
    expect(payload).toMatchObject({ receive_qty: 3, buy_qty: 2 });
    expect(payload).not.toHaveProperty("value");
  });
});
