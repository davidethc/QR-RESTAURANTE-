import { describe, expect, it } from "vitest";
import {
  INITIAL_MENU_NAV,
  SWIPE_MIN_DX,
  SWIPE_MIN_SCROLL,
  TAP_GUARD_MS,
  acceptTap,
  initialMenuNav,
  isUserSwipe,
  menuNavReducer,
  pickActiveSection,
  productPromos,
  rowOverflows,
  sameMenu,
} from "./menu-navigation";
import type { PublicCategory, PublicProduct } from "@/types/menu";

function product(id: string, over: Partial<PublicProduct> = {}): PublicProduct {
  return {
    id,
    name: `Plato ${id}`,
    description: null,
    price: 3.5,
    image_url: null,
    available: true,
    featured: false,
    position: 0,
    paired_drink: null,
    ...over,
  };
}

function category(id: string, products: PublicProduct[]): PublicCategory {
  return { id, name: `Cat ${id}`, description: null, position: 0, products };
}

describe("menuNavReducer", () => {
  it("toggle opens a closed section and marks it active", () => {
    const s = menuNavReducer(INITIAL_MENU_NAV, { type: "toggle", id: "a" });
    expect(s.open).toEqual(["a"]);
    expect(s.active).toBe("a");
  });

  it("two toggles on the same section return to closed, never a third state", () => {
    const once = menuNavReducer(INITIAL_MENU_NAV, { type: "toggle", id: "a" });
    const twice = menuNavReducer(once, { type: "toggle", id: "a" });
    expect(twice.open).toEqual([]);
    expect(twice.active).toBeNull();
  });

  it("closing another section keeps the active mark where it was", () => {
    let s = menuNavReducer(INITIAL_MENU_NAV, { type: "toggle", id: "a" });
    s = menuNavReducer(s, { type: "toggle", id: "b" });
    s = menuNavReducer(s, { type: "toggle", id: "a" });
    expect(s.open).toEqual(["b"]);
    expect(s.active).toBe("b");
  });

  it("open (chip) is idempotent: a repeated chip tap never closes the section", () => {
    const once = menuNavReducer(INITIAL_MENU_NAV, { type: "open", id: "a" });
    const twice = menuNavReducer(once, { type: "open", id: "a" });
    expect(twice.open).toEqual(["a"]);
    expect(twice.active).toBe("a");
    expect(twice).toBe(once);
  });

  it("collapse closes the section and clears its mark", () => {
    let s = menuNavReducer(INITIAL_MENU_NAV, { type: "open", id: "a" });
    s = menuNavReducer(s, { type: "collapse", id: "a" });
    expect(s.open).toEqual([]);
    expect(s.active).toBeNull();
  });

  it("spy only moves the mark and returns the same state when nothing changes", () => {
    const s = menuNavReducer(INITIAL_MENU_NAV, { type: "spy", id: "b" });
    expect(s.active).toBe("b");
    expect(menuNavReducer(s, { type: "spy", id: "b" })).toBe(s);
  });

  it("starts with the only section open when the menu has a single category", () => {
    expect(initialMenuNav(["solo"]).open).toEqual(["solo"]);
    expect(initialMenuNav(["a", "b"])).toEqual(INITIAL_MENU_NAV);
  });
});

describe("acceptTap", () => {
  it("drops a second tap on the same control inside the guard window", () => {
    const first = acceptTap(null, "a", 1000);
    expect(first.accept).toBe(true);
    expect(acceptTap(first.last, "a", 1000 + TAP_GUARD_MS - 1).accept).toBe(false);
  });

  it("accepts a tap on the same control after the window and on another control at once", () => {
    const first = acceptTap(null, "a", 1000);
    expect(acceptTap(first.last, "a", 1000 + TAP_GUARD_MS).accept).toBe(true);
    expect(acceptTap(first.last, "b", 1001).accept).toBe(true);
  });
});

describe("pickActiveSection", () => {
  const rects = [
    { id: "a", top: -400, bottom: 100 },
    { id: "b", top: 100, bottom: 600 },
    { id: "c", top: 600, bottom: 900 },
  ];

  it("picks the section crossing the line under the sticky bar", () => {
    expect(pickActiveSection(rects, 130)).toBe("b");
    expect(pickActiveSection(rects, 50)).toBe("a");
  });

  it("returns null above the first section", () => {
    expect(pickActiveSection([{ id: "a", top: 300, bottom: 500 }], 130)).toBeNull();
  });
});

describe("sameMenu", () => {
  const base = [category("c1", [product("p1"), product("p2")])];

  it("is true for a fresh copy with the same content", () => {
    expect(sameMenu(base, structuredClone(base))).toBe(true);
  });

  it("detects a dish that sold out or changed price", () => {
    const soldOut = structuredClone(base);
    soldOut[0].products[1].available = false;
    expect(sameMenu(base, soldOut)).toBe(false);
    const price = structuredClone(base);
    price[0].products[0].price = 4;
    expect(sameMenu(base, price)).toBe(false);
  });
});

describe("productPromos", () => {
  const menu = [
    category("bebidas", [product("jugo", { price: 2.5 }), product("cafe", { price: 1.5 })]),
    category("platos", [product("bolon", { price: 4 })]),
  ];
  const base = {
    receive_qty: null,
    buy_qty: null,
    channels: { delivery: true, pickup: true },
  };

  it("prices a percent discount per unit like the server", () => {
    const map = productPromos(menu, [
      { ...base, id: "p", name: "Happy", type: "discount", value_type: "percent", value: 10, applies_to: "products", target_ids: ["jugo"], label: "10% off" },
    ]);
    expect(map.jugo).toEqual({ label: "10% off", price: 2.25 });
    expect(map.cafe).toBeUndefined();
  });

  it("caps a fixed discount at the price and applies category promos to every dish", () => {
    const map = productPromos(menu, [
      { ...base, id: "f", name: "Bebidas", type: "discount", value_type: "fixed", value: 2, applies_to: "categories", target_ids: ["bebidas"], label: "-$2" },
    ]);
    expect(map.jugo.price).toBe(0.5);
    expect(map.cafe.price).toBe(0);
    expect(map.bolon).toBeUndefined();
  });

  it("keeps the biggest discount and shows 2x1 as a label without a price", () => {
    const map = productPromos(menu, [
      { ...base, id: "a", name: "A", type: "discount", value_type: "percent", value: 10, applies_to: "products", target_ids: ["bolon"], label: "10%" },
      { ...base, id: "b", name: "B", type: "discount", value_type: "percent", value: 25, applies_to: "products", target_ids: ["bolon"], label: "25%" },
      { ...base, id: "c", name: "C", type: "buy_x_get_y", value_type: null, value: null, receive_qty: 2, buy_qty: 1, applies_to: "products", target_ids: ["cafe"], label: "2x1" },
    ]);
    expect(map.bolon).toEqual({ label: "25%", price: 3 });
    expect(map.cafe).toEqual({ label: "2x1", price: null });
  });
});

describe("swipe hint", () => {
  it("only rows wider than their box overflow", () => {
    expect(rowOverflows(900, 390)).toBe(true);
    expect(rowOverflows(390, 390)).toBe(false);
    expect(rowOverflows(391, 390)).toBe(false);
  });

  it("a sideways finger swipe that moves the row dismisses it", () => {
    expect(isUserSwipe({ dx: -SWIPE_MIN_DX, dy: 4, scrolled: SWIPE_MIN_SCROLL, maxScroll: 400 })).toBe(true);
    expect(isUserSwipe({ dx: 60, dy: -10, scrolled: -40, maxScroll: 400 })).toBe(true);
  });

  it("a vertical page scroll with some sideways drift does not", () => {
    expect(isUserSwipe({ dx: -30, dy: 120, scrolled: 30, maxScroll: 400 })).toBe(false);
    expect(isUserSwipe({ dx: -30, dy: -30, scrolled: 30, maxScroll: 400 })).toBe(false);
  });

  it("a short nudge or a snap jitter does not", () => {
    expect(isUserSwipe({ dx: -(SWIPE_MIN_DX - 1), dy: 0, scrolled: 20, maxScroll: 400 })).toBe(false);
    expect(isUserSwipe({ dx: -40, dy: 0, scrolled: SWIPE_MIN_SCROLL - 1, maxScroll: 400 })).toBe(false);
  });

  it("a row that overflows by a few pixels is dismissed once swiped to its end", () => {
    expect(isUserSwipe({ dx: -40, dy: 2, scrolled: 3, maxScroll: 3 })).toBe(true);
    expect(isUserSwipe({ dx: -40, dy: 2, scrolled: 2, maxScroll: 3 })).toBe(false);
  });

  it("a row that does not overflow never dismisses it", () => {
    expect(isUserSwipe({ dx: -40, dy: 0, scrolled: 0, maxScroll: 0 })).toBe(false);
  });

  it("a scroll the customer did not make (focus, snap, code) does not", () => {
    expect(isUserSwipe({ dx: 0, dy: 0, scrolled: 150, maxScroll: 400 })).toBe(false);
  });
});
