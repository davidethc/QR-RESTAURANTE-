// Sin "use client": estas clases las usan también páginas de servidor
// (p. ej. /cash/cortes); desde un módulo cliente llegarían como referencia.
import { cn } from "@/lib/utils";

export type SegmentedControlSize = "sm" | "md";

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
