"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedControlSize = "sm" | "md";

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
};

const SIZE_ITEM_CLASS: Record<SegmentedControlSize, string> = {
  sm: "h-7 px-2.5 text-caption",
  md: "h-8 px-3 text-meta",
};

/**
 * Aspecto compartido del control segmentado: contenedor neutro (bg-muted)
 * y la opción activa se despega con una superficie blanca y borde sutil.
 * Usado por SegmentedControl (radiogroup), SegmentedLinks (nav con
 * <Link>) y por Tabs de Radix en /orders, para que las tres pantallas se
 * vean idénticas aunque cada una resuelva la navegación distinto.
 */
export function segmentedListClass(className?: string) {
  return cn(
    "inline-flex w-fit items-center gap-1 rounded-control bg-muted p-1",
    className
  );
}

export function segmentedItemClass(
  active: boolean,
  size: SegmentedControlSize = "md",
  className?: string
) {
  return cn(
    "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:cursor-wait aria-disabled:opacity-60 disabled:opacity-50",
    SIZE_ITEM_CLASS[size],
    active
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
    className
  );
}

/**
 * Control segmentado accesible (patrón radio group del ARIA APG): flechas
 * mueven selección y foco a la vez, Home/End van al extremo, y solo la
 * opción activa es alcanzable por Tab (roving tabindex).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  size = "md",
  disabled,
  className,
}: {
  options: SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  "aria-label": string;
  size?: SegmentedControlSize;
  disabled?: boolean;
  className?: string;
}) {
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>());

  // aria-disabled en vez de disabled: un botón deshabilitado suelta el
  // foco, y mientras se recargan los datos el teclado quedaría en <body>.
  function select(next: T) {
    if (disabled || next === value) return;
    onValueChange(next);
  }

  function selectAndFocus(index: number) {
    const option = options[index];
    if (!option) return;
    select(option.value);
    itemRefs.current.get(option.value)?.focus();
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectAndFocus((index + 1) % options.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectAndFocus((index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        selectAndFocus(0);
        break;
      case "End":
        event.preventDefault();
        selectAndFocus(options.length - 1);
        break;
    }
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={segmentedListClass(className)}>
      {options.map((option, index) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) itemRefs.current.set(option.value, el);
              else itemRefs.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            aria-disabled={disabled || undefined}
            onClick={() => select(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={segmentedItemClass(active, size)}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
