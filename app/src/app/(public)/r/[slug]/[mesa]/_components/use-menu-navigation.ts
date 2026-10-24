"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import {
  acceptTap,
  initialMenuNav,
  menuNavReducer,
  pickActiveSection,
  type TapRecord,
} from "@/lib/menu-navigation";

/** Gap left between the sticky bar and a section scrolled into place. */
const SCROLL_GAP = 8;
/** "Arriba" appears after scrolling roughly one screen. */
const TOP_BUTTON_AFTER = 700;

type PendingScroll = { id: string; kind: "to" | "keep" } | null;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Navigation of the customer menu, shared by the QR menu (`/r`) and the
 * digital menu (`/pedir`): which sections are open, which chip is marked,
 * and every scroll the menu does on its own.
 *
 * What fixes the reported blink:
 * - Opening from a chip commits the state FIRST and scrolls on the next
 *   frame, measured against the real sticky-bar height. Before, the smooth
 *   scroll started while the section was still closed and its target moved
 *   under the finger.
 * - A second tap on the same control within `TAP_GUARD_MS` is dropped, so
 *   one intent never opens and closes a section.
 * - The scroll-spy is locked from a programmatic scroll until the customer
 *   touches or scrolls the page again. Unlocking on `scrollend` was not
 *   enough: a section near the bottom cannot reach the bar, so the spy
 *   re-marked the previous chip right after the tap.
 */
export function useMenuNavigation(categoryIds: readonly string[]) {
  const [state, dispatch] = useReducer(menuNavReducer, categoryIds, initialMenuNav);

  const chipStrip = useRef<HTMLElement | null>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const chipEls = useRef(new Map<string, HTMLElement>());
  const lastTap = useRef<TapRecord | null>(null);
  const pending = useRef<PendingScroll>(null);
  const spyLocked = useRef(false);
  const idsRef = useRef(categoryIds);
  const barHeightRef = useRef(0);

  const [barHeight, setBarHeight] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    idsRef.current = categoryIds;
  }, [categoryIds]);

  // Real height of the sticky bar (search + chips), so scrolls and the
  // sticky section header land right under it on every phone. Callback
  // refs (not ref objects) so the returned object holds no refs that a
  // component could read during render.
  const barRef = useCallback((bar: HTMLDivElement | null) => {
    if (!bar) return;
    const update = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      barHeightRef.current = h;
      setBarHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const chipStripRef = useCallback((el: HTMLElement | null) => {
    chipStrip.current = el;
  }, []);

  const tap = useCallback((id: string) => {
    const result = acceptTap(lastTap.current, id, performance.now());
    lastTap.current = result.last;
    return result.accept;
  }, []);

  const lockSpy = useCallback(() => {
    spyLocked.current = true;
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (!tap(`toggle:${id}`)) return;
      if (sectionEls.current.get(id)?.dataset.open === "true") pending.current = { id, kind: "keep" };
      dispatch({ type: "toggle", id });
    },
    [tap]
  );

  const goTo = useCallback(
    (id: string) => {
      if (!tap(`chip:${id}`)) return;
      pending.current = { id, kind: "to" };
      lockSpy();
      dispatch({ type: "open", id });
    },
    [tap, lockSpy]
  );

  const collapse = useCallback(
    (id: string) => {
      if (!tap(`collapse:${id}`)) return;
      pending.current = { id, kind: "keep" };
      dispatch({ type: "collapse", id });
    },
    [tap]
  );

  const collapseAll = useCallback(() => {
    if (!tap("collapse-all")) return;
    // Keep the section under the bar in place, so collapsing does not throw
    // the customer to an unrelated point of the page.
    const line = barHeightRef.current + 24;
    const ids = idsRef.current;
    const rects = ids.flatMap((id) => {
      const el = sectionEls.current.get(id);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ id, top: r.top, bottom: r.bottom }];
    });
    const anchor = pickActiveSection(rects, line);
    if (anchor) pending.current = { id: anchor, kind: "keep" };
    dispatch({ type: "collapseAll" });
  }, [tap]);

  const showAll = useCallback((id: string) => dispatch({ type: "showAll", id }), []);

  const scrollToTop = useCallback(() => {
    lockSpy();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [lockSpy]);

  // Scrolls that depend on the new layout run after React committed it.
  useLayoutEffect(() => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    const el = sectionEls.current.get(job.id);
    if (!el) return;
    const bar = barHeightRef.current;

    if (job.kind === "keep") {
      // The section just shrank. If its top went above the bar, put the
      // header back right under it — before paint, so nothing jumps.
      const top = el.getBoundingClientRect().top;
      if (top < bar) window.scrollTo({ top: window.scrollY + top - bar - SCROLL_GAP, behavior: "auto" });
      return;
    }

    const frame = requestAnimationFrame(() => {
      const top = el.getBoundingClientRect().top + window.scrollY - bar - SCROLL_GAP;
      lockSpy();
      window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [state, lockSpy]);

  // Scroll-spy + "Arriba". Passive, one measurement per frame at most.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setShowTop(window.scrollY > TOP_BUTTON_AFTER);
      if (spyLocked.current) return;
      const line = barHeightRef.current + 24;
      const rects = idsRef.current.flatMap((id) => {
        const el = sectionEls.current.get(id);
        if (!el) return [];
        const r = el.getBoundingClientRect();
        return [{ id, top: r.top, bottom: r.bottom }];
      });
      // At the very bottom the last sections can never reach the bar:
      // mark the last one that is on screen instead.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const visible = rects.filter((r) => r.top < window.innerHeight && r.bottom > line);
      const id = atBottom && visible.length > 0 ? visible[visible.length - 1].id : pickActiveSection(rects, line);
      dispatch({ type: "spy", id });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // The customer grabbing the page hands the mark back to the spy.
    const unlock = () => {
      spyLocked.current = false;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("wheel", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("wheel", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Keep the marked chip visible in the horizontal strip. Only the strip
  // scrolls: `scrollIntoView` would also move the page.
  useEffect(() => {
    const strip = chipStrip.current;
    const chip = state.active ? chipEls.current.get(state.active) : null;
    if (!strip || !chip) return;
    const left = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [state.active]);

  // One stable ref callback for all sections and one for all chips: the id
  // travels in `data-section-id` / `data-chip-id`.
  const sectionRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const id = el.dataset.sectionId;
    if (!id) return;
    sectionEls.current.set(id, el);
    return () => {
      if (sectionEls.current.get(id) === el) sectionEls.current.delete(id);
    };
  }, []);

  const chipRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const id = el.dataset.chipId;
    if (!id) return;
    chipEls.current.set(id, el);
    return () => {
      if (chipEls.current.get(id) === el) chipEls.current.delete(id);
    };
  }, []);

  return {
    state,
    isOpen: (id: string) => state.open.includes(id),
    isExpanded: (id: string) => state.expanded.includes(id),
    toggle,
    goTo,
    collapse,
    collapseAll,
    showAll,
    scrollToTop,
    showTop,
    barHeight,
    attachBar: barRef,
    attachChipStrip: chipStripRef,
    attachSection: sectionRef,
    attachChip: chipRef,
  };
}

export type MenuNavigation = ReturnType<typeof useMenuNavigation>;
