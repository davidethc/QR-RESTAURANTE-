"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  segmentedItemClass,
  segmentedListClass,
  type SegmentedControlSize,
} from "@/components/shared/segmented-control";

export type SalesRange = "hoy" | "7d" | "30d";

const RANGES: { value: SalesRange; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
];

export type SegmentedLinkOption = {
  href: string;
  label: ReactNode;
  active: boolean;
};

/**
 * Mismo aspecto que SegmentedControl pero navegando con <Link>: se usa
 * cuando las opciones son rutas reales (prefetch, abrir en pestaña nueva),
 * no un valor de estado. Por eso no es un radiogroup: es un <nav> con
 * enlaces y aria-current="page" en el activo.
 */
export function SegmentedLinks({
  options,
  ariaLabel,
  size = "md",
}: {
  options: SegmentedLinkOption[];
  ariaLabel: string;
  size?: SegmentedControlSize;
}) {
  return (
    <nav aria-label={ariaLabel} className={segmentedListClass()}>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? "page" : undefined}
          className={segmentedItemClass(option.active, size)}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

export function RangeTabs({ active }: { active: SalesRange }) {
  return (
    <SegmentedLinks
      ariaLabel="Periodo"
      options={RANGES.map((r) => ({
        href: r.value === "hoy" ? "/sales" : `/sales?range=${r.value}`,
        label: r.label,
        active: r.value === active,
      }))}
    />
  );
}
