"use client";

import * as React from "react";
import {
  segmentedItemClass,
  segmentedListClass,
  type SegmentedControlSize,
} from "./segmented-classes";

export { segmentedItemClass, segmentedListClass };
export type { SegmentedControlSize };

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
};

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
