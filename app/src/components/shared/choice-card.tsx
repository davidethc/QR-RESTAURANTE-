"use client";

import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { posPressable, toneSoft, type PosTone } from "./pos-tone";

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  /** Una línea que explica qué pasa si se elige. */
  description?: string;
  icon: LucideIcon;
  /** Tono del icono (y del borde al seleccionar). */
  tone?: PosTone;
  disabled?: boolean;
  /** Dato a la derecha/abajo (ej. un monto). */
  meta?: React.ReactNode;
}

/**
 * Elección grande con icono: la forma de preguntar "¿qué quieres hacer?" en
 * el POS (tipo de pedido, cómo pagan, método). Es un radiogroup de verdad:
 * flechas para moverse, Enter/Espacio para elegir, el elegido lleva check
 * (no solo color). Con `onPick` se usa como "botón de paso" (elige y avanza).
 */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 3,
  size = "lg",
  className,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
  size?: "md" | "lg";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, delta: number) {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + delta * step + n * step) % n;
      if (!options[i].disabled) {
        refs.current[i]?.focus();
        onChange(options[i].value);
        return;
      }
    }
  }

  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid gap-3",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const tone = o.tone ?? "neutral";
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            tabIndex={i === activeIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              posPressable,
              "group relative flex w-full gap-3 rounded-card border-2 bg-card text-left",
              size === "lg" ? "min-h-28 flex-col items-start p-4 sm:p-5" : "min-h-16 items-center p-3",
              selected ? "border-foreground shadow-md" : "border-border hover:border-border-strong"
            )}
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-control border",
                size === "lg" ? "size-12" : "size-10",
                toneSoft[tone]
              )}
            >
              <o.icon className={size === "lg" ? "size-6" : "size-5"} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body font-semibold leading-tight text-foreground">{o.title}</span>
              {o.description && <span className="text-meta leading-snug text-muted-foreground">{o.description}</span>}
              {o.meta && <span className="mt-1 text-body-sm font-semibold tabular-nums text-foreground">{o.meta}</span>}
            </span>
            <span
              aria-hidden
              className={cn(
                "absolute right-3 top-3 flex size-6 items-center justify-center rounded-full border-2 transition-[background-color,border-color] duration-150",
                selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-transparent"
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
