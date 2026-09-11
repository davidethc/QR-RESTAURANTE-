"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * El selector de cantidad, en un solo sitio.
 *
 * Vivía suelto dentro de la ficha de producto del cliente. Al necesitarlo
 * también la pantalla en la que el mesero toma el pedido, se extrajo antes de
 * que existieran dos copias: un control que se toca con el pulgar y tiene
 * reglas de accesibilidad propias es justo el que no conviene tener duplicado.
 *
 * `min` es 1 en la ficha (no se agrega "cero de algo") y 0 en el carrito del
 * mesero, donde bajar a cero es como se quita una línea.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  label,
  className,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  /** Qué se está contando, para quien navega con lector de pantalla. */
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const size = compact ? "size-9" : "size-11";

  return (
    <div
      className={cn(
        "neu-inset flex items-center gap-1 rounded-full bg-secondary p-1",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label ? `Quitar uno de ${label}` : "Quitar uno"}
        className={cn(size, "rounded-full hover:bg-card")}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </Button>
      <span
        aria-live="polite"
        className={cn(
          "text-center font-semibold tabular-nums",
          compact ? "w-6 text-[14px]" : "w-7 text-[15px]"
        )}
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label ? `Agregar uno de ${label}` : "Agregar uno"}
        className={cn(size, "rounded-full hover:bg-card")}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </Button>
    </div>
  );
}
