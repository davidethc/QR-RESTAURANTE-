"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Pointer } from "lucide-react";
import { isUserSwipe, readSwipeHint, rememberSwipeHint, rowOverflows, type SwipeHintStatus } from "@/lib/menu-navigation";

/**
 * One status for every row on the page: swiping any row hides the hint on
 * all of them at once, and the device remembers it.
 */
const storage = () => window.localStorage;
let status: SwipeHintStatus | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SwipeHintStatus {
  if (status === null) status = readSwipeHint(storage);
  return status;
}

/** The server cannot know the device: render nothing until the client reads it. */
function getServerSnapshot(): SwipeHintStatus {
  return "unavailable";
}

function dismiss() {
  if (status === "seen") return;
  status = "seen";
  rememberSwipeHint(storage);
  listeners.forEach((listener) => listener());
}

/** A trackpad swipe is a burst of wheel events; this much quiet ends it. */
const WHEEL_GESTURE_GAP_MS = 250;

/**
 * Watches one horizontal row while the hint is pending.
 *
 * Only a gesture the customer makes dismisses it (see `isUserSwipe`): the
 * old version listened to `scroll`, so a focus restore after closing the
 * dish sheet, a snap adjustment or a diagonal flick while scrolling the
 * page marked the hint as seen forever after one visit.
 */
export function useSwipeHint() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    if (!row || current !== "show") return;
    const ro = new ResizeObserver(() => setOverflows(rowOverflows(row.scrollWidth, row.clientWidth)));
    ro.observe(row);

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
      row.removeEventListener("touchstart", onTouchStart);
      row.removeEventListener("touchmove", onTouchMove);
      row.removeEventListener("touchend", onTouchEnd);
      row.removeEventListener("touchcancel", onTouchEnd);
      row.removeEventListener("wheel", onWheel);
    };
  }, [row, current]);

  return { attachRow: setRow, showHint: current === "show" && overflows };
}

/**
 * Pill over the right edge of the photos: it fades in once and stays,
 * while the finger glides left and back in one seamless loop (the first
 * and last keyframes are the same pose, so a cycle never jumps). Only
 * `transform` and `opacity` animate, on an HTML wrapper rather than the
 * SVG, so WebKit keeps it on the compositor. Decorative (`aria-hidden`)
 * and `pointer-events-none`, so taps reach the cards under it; absolutely
 * placed, so it never moves the layout. With reduced motion it is a still
 * "Desliza →".
 */
export function SwipeHint() {
  return (
    <span aria-hidden className="pointer-events-none absolute right-5 top-[83px] z-[1] -translate-y-1/2">
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
