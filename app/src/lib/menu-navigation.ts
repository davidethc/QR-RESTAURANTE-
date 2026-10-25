import type { PublicCategory, PublicProduct } from "@/types/menu";
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
  /** Sections whose "Ver N más" was used. */
  expanded: readonly string[];
  /** Section marked in the chip bar. */
  active: string | null;
}

export type MenuNavAction =
  | { type: "toggle"; id: string }
  | { type: "open"; id: string }
  | { type: "collapse"; id: string }
  | { type: "collapseAll" }
  | { type: "showAll"; id: string }
  | { type: "spy"; id: string | null };

export const INITIAL_MENU_NAV: MenuNavState = { open: [], expanded: [], active: null };

/** Dishes shown in an open section before "Ver N más". */
export const PREVIEW_LIMIT = 6;

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
    expanded: without(state.expanded, id),
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
    case "showAll":
      return state.expanded.includes(action.id) ? state : { ...state, expanded: [...state.expanded, action.id] };
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

/**
 * Dishes to render in an open section. One leftover dish is shown instead
 * of a "Ver 1 más" button that costs as much space as the dish itself.
 */
export function visibleProducts(products: readonly PublicProduct[], expanded: boolean): {
  shown: readonly PublicProduct[];
  hidden: number;
} {
  if (expanded || products.length <= PREVIEW_LIMIT + 1) return { shown: products, hidden: 0 };
  return { shown: products.slice(0, PREVIEW_LIMIT), hidden: products.length - PREVIEW_LIMIT };
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
 * "Desliza" hint on the horizontal dish rows. It shows until the customer
 * scrolls any row sideways once, then never again on that device. Storage
 * access is wrapped because Safari private mode and blocked site data throw
 * on read: when it cannot be read the hint renders nothing rather than
 * nagging on every visit.
 */
export const SWIPE_HINT_KEY = "monky:menu-swipe-hint";

/** Horizontal scroll (px) that counts as a deliberate swipe, not a snap jitter. */
export const SWIPE_HINT_MIN_SCROLL = 8;

export type SwipeHintStatus = "show" | "seen" | "unavailable";

export function readSwipeHint(getStorage: () => Pick<Storage, "getItem">): SwipeHintStatus {
  try {
    return getStorage().getItem(SWIPE_HINT_KEY) ? "seen" : "show";
  } catch {
    return "unavailable";
  }
}

export function rememberSwipeHint(getStorage: () => Pick<Storage, "setItem">): void {
  try {
    getStorage().setItem(SWIPE_HINT_KEY, "1");
  } catch {
    // Nothing to remember with; the hint is hidden for this visit anyway.
  }
}

/** A row overflows when its content is wider than its box (1px rounding slack). */
export function rowOverflows(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth > clientWidth + 1;
}

export function swipedEnough(scrollLeft: number): boolean {
  return scrollLeft >= SWIPE_HINT_MIN_SCROLL;
}
