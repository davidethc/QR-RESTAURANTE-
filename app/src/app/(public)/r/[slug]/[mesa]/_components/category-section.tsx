"use client";

import { ChevronDown } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { ProductCardCompact } from "./product-card";
import type { PublicCategory } from "@/types/menu";

/**
 * Una categoría de la carta, en acordeón.
 *
 * Cerrada muestra solo su encabezado — pero un encabezado que ya
 * informa (cuántos platos y desde qué precio), para que el cliente
 * decida si le interesa sin tener que abrirla a ciegas.
 *
 * Abierta, los platos salen únicamente en fila horizontal: se ven
 * varios de un vistazo y la categoría no empuja el resto de la carta
 * hacia abajo. Para encontrar un plato concreto sin deslizar está el
 * buscador de arriba, que además dice a qué categoría pertenece cada
 * resultado.
 */
export function CategorySection({
  category,
  isOpen,
  onToggle,
  sectionRef,
  onSelectProduct,
  cartQuantities,
}: {
  category: PublicCategory;
  isOpen: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  onSelectProduct: (product: PublicCategory["products"][number]) => void;
  cartQuantities: Record<string, number>;
}) {
  const count = category.products.length;
  const availablePrices = category.products
    .filter((p) => p.available)
    .map((p) => p.price);
  const fromPrice =
    availablePrices.length > 0 ? Math.min(...availablePrices) : null;

  return (
    <section ref={sectionRef} id={`cat-${category.id}`} className="scroll-mt-36">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left transition-colors",
          isOpen ? "bg-transparent" : "active:bg-secondary/60"
        )}
      >
        <span aria-hidden className="text-xl leading-none">
          {getCategoryIcon(category.name)}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display truncate text-[17px] font-semibold leading-tight text-foreground">
            {category.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? "plato" : "platos"}
            {fromPrice !== null && <> · desde {formatPrice(fromPrice)}</>}
          </span>
        </span>

        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-all duration-200",
            isOpen && "rotate-180 border-primary/30 bg-primary/10 text-primary"
          )}
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </button>

      {isOpen && (
        // scroll-pl-4 / scroll-pr-4: sin esto, scroll-snap alinea las
        // tarjetas al borde del scrollport e ignora el padding, así que
        // la primera y la última quedan pegadas al filo de la pantalla.
        <div className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 scroll-pr-4 gap-2.5 overflow-x-auto px-4 pb-1 pt-2">
          {category.products.map((product) => (
            <ProductCardCompact
              key={product.id}
              product={product}
              categoryName={category.name}
              onSelect={onSelectProduct}
              quantityInCart={cartQuantities[product.id] ?? 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
