import type { PublicCategory } from "@/types/menu";
import type { DigitalMenuPromotion } from "@/types/digital-menu";

/**
 * Pure navigation state of the customer menu (QR `/r` and digital `/pedir`).
 *
 * Kept out of React so the rules that caused the "green border blinks"
 * bug are tested: a section toggles exactly once per tap, a chip tap only
 * ever opens, and the scroll-spy can move the mark without touching which
 * sections are open.
 */
export interface MenuNavState {
  /** Open sections, in the order they were opened. */
  open: readonly string[];
  /** Section marked in the chip bar. */
  active: string | null;
}

export type MenuNavAction =
  | { type: "toggle"; id: string }
  | { type: "open"; id: string }
  | { type: "collapse"; id: string }
  | { type: "collapseAll" }
  | { type: "spy"; id: string | null };

export const INITIAL_MENU_NAV: MenuNavState = { open: [], active: null };

/** A second tap on the same control within this window is the same intent. */
export const TAP_GUARD_MS = 350;

/** Sections start closed; a menu with one category opens it. */
export function initialMenuNav(categoryIds: readonly string[]): MenuNavState {
  return categoryIds.length === 1 ? { ...INITIAL_MENU_NAV, open: [categoryIds[0]], active: categoryIds[0] } : INITIAL_MENU_NAV;
}

function without(list: readonly string[], id: string) {
  return list.filter((x) => x !== id);
}

function close(state: MenuNavState, id: string): MenuNavState {
  return {
    open: without(state.open, id),
    active: state.active === id ? null : state.active,
  };
}

export function menuNavReducer(state: MenuNavState, action: MenuNavAction): MenuNavState {
  switch (action.type) {
    case "toggle":
      return state.open.includes(action.id)
        ? close(state, action.id)
        : { ...state, open: [...state.open, action.id], active: action.id };
    case "open":
      if (state.open.includes(action.id) && state.active === action.id) return state;
      return {
        ...state,
        open: state.open.includes(action.id) ? state.open : [...state.open, action.id],
        active: action.id,
      };
    case "collapse":
      return state.open.includes(action.id) ? close(state, action.id) : state;
    case "collapseAll":
      return state.open.length === 0 && state.active === null ? state : INITIAL_MENU_NAV;
    case "spy":
      return state.active === action.id ? state : { ...state, active: action.id };
  }
}

export interface TapRecord {
  id: string;
  at: number;
}

/**
 * Double-tap guard. A phone easily registers two taps, and when the first
 * one feels slow the customer taps again: without this the section opened
 * and closed in the same breath (the reported blink).
 */
export function acceptTap(last: TapRecord | null, id: string, now: number): { accept: boolean; last: TapRecord | null } {
  if (last && last.id === id && now - last.at < TAP_GUARD_MS) return { accept: false, last };
  return { accept: true, last: { id, at: now } };
}

/** Section crossing the horizontal line `line` px below the viewport top. */
export function pickActiveSection(rects: readonly { id: string; top: number; bottom: number }[], line: number): string | null {
  for (const r of rects) {
    if (r.top <= line && r.bottom > line) return r.id;
  }
  return null;
}

/**
 * True when two menu payloads render the same. The live refresh brings a
 * new array every 15 s; comparing content lets it skip the state update so
 * the whole menu does not re-render for nothing.
 */
export function sameMenu(a: readonly PublicCategory[], b: readonly PublicCategory[]): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface PromoDisplay {
  label: string;
  /** Unit price after the discount; null for promos that are not a plain discount (2x1). */
  price: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Promotion to show on each dish, mirroring the server's per-unit rule
 * (docs/pos-spec/tanda4-db.md): percent → price × value / 100, fixed →
 * min(value, price); the biggest discount wins. Display only: the quote
 * of the order is what the customer pays.
 */
export function productPromos(
  categories: readonly PublicCategory[],
  promotions: readonly DigitalMenuPromotion[]
): Record<string, PromoDisplay> {
  const map: Record<string, PromoDisplay> = {};
  if (promotions.length === 0) return map;
  for (const category of categories) {
    for (const product of category.products) {
      for (const promo of promotions) {
        const target = promo.applies_to === "products" ? product.id : category.id;
        if (!promo.target_ids.includes(target)) continue;
        let price: number | null = null;
        if (promo.type === "discount" && promo.value != null) {
          const off =
            promo.value_type === "percent"
              ? round2((product.price * promo.value) / 100)
              : promo.value_type === "fixed"
                ? Math.min(promo.value, product.price)
                : 0;
          price = round2(product.price - off);
        }
        const prev = map[product.id];
        if (!prev || (price !== null && (prev.price === null || price < prev.price))) {
          map[product.id] = { label: promo.label, price };
        }
      }
    }
  }
  return map;
}

/**
 * "Desliza" hint on the horizontal dish rows. Each open category gives the
 * customer this long to swipe its row on their own; if they have not, the
 * hint appears on that row and stays until they swipe it.
 */
export const SWIPE_HINT_DELAY_MS = 1500;

/** Finger travel (px) that reads as a deliberate sideways swipe. */
export const SWIPE_MIN_DX = 24;
/** Row scroll (px) that proves the swipe actually moved the row. */
export const SWIPE_MIN_SCROLL = 8;

/** A row overflows when its content is wider than its box (1px rounding slack). */
export function rowOverflows(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth > clientWidth + 1;
}

/**
 * True only for a gesture the customer made: the finger (or trackpad)
 * travelled sideways more than it did vertically, and the row really
 * scrolled. A diagonal flick while scrolling the page, a focus or snap
 * adjustment (no gesture) or a swipe against the row edge (no scroll)
 * never counts. A row that overflows by only a few pixels counts once it
 * reaches its end, so the hint can always be dismissed.
 */
export function isUserSwipe({
  dx,
  dy,
  scrolled,
  maxScroll,
}: {
  dx: number;
  dy: number;
  scrolled: number;
  maxScroll: number;
}): boolean {
  const needed = Math.max(1, Math.min(SWIPE_MIN_SCROLL, maxScroll));
  return Math.abs(dx) >= SWIPE_MIN_DX && Math.abs(dx) > Math.abs(dy) && Math.abs(scrolled) >= needed;
}
