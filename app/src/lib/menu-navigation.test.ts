import { describe, expect, it } from "vitest";
import {
  INITIAL_MENU_NAV,
  PREVIEW_LIMIT,
  TAP_GUARD_MS,
  acceptTap,
  initialMenuNav,
  menuNavReducer,
  pickActiveSection,
  productPromos,
  sameMenu,
  visibleProducts,
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

  it("collapse closes the section and forgets its 'Ver más'", () => {
    let s = menuNavReducer(INITIAL_MENU_NAV, { type: "open", id: "a" });
    s = menuNavReducer(s, { type: "showAll", id: "a" });
    s = menuNavReducer(s, { type: "collapse", id: "a" });
    expect(s.open).toEqual([]);
    expect(s.expanded).toEqual([]);
    expect(s.active).toBeNull();
  });

  it("collapseAll closes everything", () => {
    let s = menuNavReducer(INITIAL_MENU_NAV, { type: "open", id: "a" });
    s = menuNavReducer(s, { type: "open", id: "b" });
    s = menuNavReducer(s, { type: "collapseAll" });
    expect(s).toEqual(INITIAL_MENU_NAV);
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

describe("visibleProducts", () => {
  const products = Array.from({ length: 9 }, (_, i) => product(String(i)));

  it("shows the first dishes and counts the hidden ones", () => {
    const v = visibleProducts(products, false);
    expect(v.shown).toHaveLength(PREVIEW_LIMIT);
    expect(v.hidden).toBe(9 - PREVIEW_LIMIT);
  });

  it("shows everything once expanded, and never hides a single leftover dish", () => {
    expect(visibleProducts(products, true).hidden).toBe(0);
    const seven = products.slice(0, PREVIEW_LIMIT + 1);
    expect(visibleProducts(seven, false).shown).toHaveLength(PREVIEW_LIMIT + 1);
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
