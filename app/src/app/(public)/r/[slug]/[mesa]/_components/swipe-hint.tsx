"use client";

import { useEffect, useState } from "react";
import { Pointer } from "lucide-react";
import { SWIPE_HINT_DELAY_MS, isUserSwipe, rowOverflows } from "@/lib/menu-navigation";

/** Rows the customer already swiped during this visit: their hint never returns. */
const swipedRows = new Set<string>();

/** A trackpad swipe is a burst of wheel events; this much quiet ends it. */
const WHEEL_GESTURE_GAP_MS = 250;

/**
 * Hint for one horizontal row. Each row waits `SWIPE_HINT_DELAY_MS` for
 * the customer to swipe it; if they have not, the hint appears there and
 * stays until they do. Swiping one row only dismisses that row's hint.
 *
 * Only a gesture the customer makes counts (see `isUserSwipe`): a focus
 * restore, a snap adjustment or a diagonal flick while scrolling the page
 * never dismisses it.
 */
export function useSwipeHint(rowId: string) {
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [waited, setWaited] = useState(false);
  const [swiped, setSwiped] = useState(() => swipedRows.has(rowId));

  useEffect(() => {
    if (!row || swiped) return;
    const ro = new ResizeObserver(() => setOverflows(rowOverflows(row.scrollWidth, row.clientWidth)));
    ro.observe(row);
    const timer = setTimeout(() => setWaited(true), SWIPE_HINT_DELAY_MS);

    const dismiss = () => {
      swipedRows.add(rowId);
      setSwiped(true);
    };
    const maxScroll = () => row.scrollWidth - row.clientWidth;

    let touch: { x: number; y: number; left: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touch = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, left: row.scrollLeft } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!touch || !t) return;
      const swipe = { dx: t.clientX - touch.x, dy: t.clientY - touch.y, scrolled: row.scrollLeft - touch.left };
      if (isUserSwipe({ ...swipe, maxScroll: maxScroll() })) dismiss();
    };
    const onTouchEnd = () => {
      touch = null;
    };

    let wheel = { dx: 0, dy: 0, left: 0, at: 0 };
    const onWheel = (e: WheelEvent) => {
      if (e.timeStamp - wheel.at > WHEEL_GESTURE_GAP_MS) wheel = { dx: 0, dy: 0, left: row.scrollLeft, at: 0 };
      wheel.dx += e.deltaX;
      wheel.dy += e.deltaY;
      wheel.at = e.timeStamp;
      // The row scrolls after the event: measure on the next frame.
      requestAnimationFrame(() => {
        const swipe = { dx: wheel.dx, dy: wheel.dy, scrolled: row.scrollLeft - wheel.left };
        if (isUserSwipe({ ...swipe, maxScroll: maxScroll() })) dismiss();
      });
    };

    const passive = { passive: true } as const;
    row.addEventListener("touchstart", onTouchStart, passive);
    row.addEventListener("touchmove", onTouchMove, passive);
    row.addEventListener("touchend", onTouchEnd, passive);
    row.addEventListener("touchcancel", onTouchEnd, passive);
    row.addEventListener("wheel", onWheel, passive);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
      row.removeEventListener("touchstart", onTouchStart);
      row.removeEventListener("touchmove", onTouchMove);
      row.removeEventListener("touchend", onTouchEnd);
      row.removeEventListener("touchcancel", onTouchEnd);
      row.removeEventListener("wheel", onWheel);
    };
  }, [row, rowId, swiped]);

  return { attachRow: setRow, showHint: waited && overflows && !swiped };
}

/**
 * Pill over the right edge of the photos: it fades in and stays, while the
 * finger glides left and back in one seamless loop (the first and last
 * keyframes are the same pose, so a cycle never jumps). Only `transform`
 * and `opacity` animate, on an HTML wrapper rather than the SVG, so WebKit
 * keeps it on the compositor. Decorative (`aria-hidden`) and
 * `pointer-events-none`, so taps reach the cards under it; absolutely
 * placed, so it never moves the layout. With reduced motion it is a still
 * "Desliza →".
 */
export function SwipeHint() {
  return (
    <span aria-hidden className="pointer-events-none absolute right-4 top-[87px] z-[1] -translate-y-1/2">
      <span className="swipe-hint flex h-9 items-center gap-1.5 rounded-full bg-card/95 pl-2.5 pr-3.5 text-body-sm font-semibold text-foreground shadow-md ring-1 ring-border/70">
        <span className="swipe-hint-finger flex">
          <Pointer className="size-4 text-primary" strokeWidth={2.5} />
        </span>
        Desliza
        <span className="hidden motion-reduce:inline">→</span>
      </span>
    </span>
  );
}
