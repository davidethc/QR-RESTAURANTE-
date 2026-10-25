"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Pointer } from "lucide-react";
import {
  readSwipeHint,
  rememberSwipeHint,
  rowOverflows,
  swipedEnough,
  type SwipeHintStatus,
} from "@/lib/menu-navigation";

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

/**
 * Watches one horizontal row while the hint is pending. Cheap on purpose:
 * a ResizeObserver decides whether the row overflows (it fires once on
 * observe, so no measuring during render) and one passive scroll listener
 * that is removed as soon as the hint is gone.
 */
export function useSwipeHint() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    if (!row || current !== "show") return;
    const ro = new ResizeObserver(() => setOverflows(rowOverflows(row.scrollWidth, row.clientWidth)));
    ro.observe(row);
    const onScroll = () => {
      if (swipedEnough(row.scrollLeft)) dismiss();
    };
    row.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      row.removeEventListener("scroll", onScroll);
    };
  }, [row, current]);

  return { attachRow: setRow, showHint: current === "show" && overflows };
}

/**
 * Pill over the right edge of the photos: a finger glides left, then the
 * pill fades out and rests before the next pass. Decorative (`aria-hidden`)
 * and `pointer-events-none`, so taps reach the cards under it; absolutely
 * placed, so it never moves the layout. With reduced motion it is a still
 * "Desliza →".
 */
export function SwipeHint() {
  return (
    <span aria-hidden className="pointer-events-none absolute right-5 top-[83px] z-[1] -translate-y-1/2">
      <span className="swipe-hint flex h-9 items-center gap-1.5 rounded-full bg-card/95 pl-2.5 pr-3.5 text-body-sm font-semibold text-foreground shadow-md ring-1 ring-border/70">
        <Pointer className="swipe-hint-finger size-4 text-primary" strokeWidth={2.5} />
        Desliza
        <span className="hidden motion-reduce:inline">→</span>
      </span>
    </span>
  );
}
