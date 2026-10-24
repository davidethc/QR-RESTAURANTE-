import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/public-menu", () => ({ fetchPublicMenuCategories: vi.fn() }));

import { nextLiveMenu } from "./use-live-menu";
import type { PublicCategory } from "@/types/menu";

const menu: PublicCategory[] = [
  {
    id: "c1",
    name: "Desayunos",
    description: null,
    position: 0,
    products: [
      {
        id: "p1",
        name: "Bolón",
        description: null,
        price: 3,
        image_url: null,
        available: true,
        featured: false,
        position: 0,
        paired_drink: null,
      },
    ],
  },
];

describe("nextLiveMenu", () => {
  it("keeps the same state object when the refresh brings an identical menu", () => {
    const prev = { base: menu, data: menu };
    expect(nextLiveMenu(prev, menu, structuredClone(menu))).toBe(prev);
  });

  it("does not create state on the first refresh when nothing changed", () => {
    expect(nextLiveMenu(null, menu, structuredClone(menu))).toBeNull();
  });

  it("replaces the data when availability changed", () => {
    const next = structuredClone(menu);
    next[0].products[0].available = false;
    const result = nextLiveMenu(null, menu, next);
    expect(result?.data).toBe(next);
    expect(result?.base).toBe(menu);
  });
});
