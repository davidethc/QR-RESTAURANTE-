"use client";

import { cn, formatPrice } from "@/lib/utils";
import { ProductCardCompact } from "./product-card";
import type { PublicCategory } from "@/types/menu";

/**
 * Una categoría de la carta, como entrada de un índice.
 *
 * No es un acordeón con chevron: es una fila numerada separada por una
 * regla de 1px, como el índice de una carta impresa. El chevron y la
 * tarjeta con sombra eran justamente lo que hacía que la pantalla se
 * leyera como un componente por defecto en vez de como una carta.
 *
 * La fila dice tres cosas y en este orden: el número (posición y ritmo),
 * el nombre, y los primeros platos escritos. "16 platos" dice cuánto
 * hay; "Tigrillo · Bolón · Mote pillo" dice si te da hambre, que es lo
 * que de verdad decide si la abres.
 *
 * Abierta, los platos salen en fila horizontal: se ven varios de un
 * vistazo y la categoría no empuja el resto de la carta hacia abajo.
 */
export function CategorySection({
  category,
  index,
  isOpen,
  onToggle,
  sectionRef,
  onSelectProduct,
  cartQuantities,
}: {
  category: PublicCategory;
  /** Posición en la carta, para el número del índice (01, 02, …). */
  index: number;
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

  // Tres nombres bastan para dar el sabor de la categoría; más se corta
  // en pantalla y deja de leerse.
  const previewNames = category.products.slice(0, 3).map((p) => p.name);
  const remaining = count - previewNames.length;

  return (
    <section ref={sectionRef} id={`cat-${category.id}`} className="scroll-mt-36">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-start gap-4 border-t border-border px-4 py-4 text-left transition-colors active:bg-muted"
      >
        {/* El número es el único indicador de estado: en verde y con el
            fondo marcado cuando la categoría está abierta. Un chevron
            haría el mismo trabajo pero delatando el acordeón. */}
        <span
          className={cn(
            "mt-1 shrink-0 text-[12px] font-semibold tabular-nums transition-colors",
            isOpen ? "text-primary" : "text-muted-foreground/70"
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-display truncate text-[21px] font-semibold leading-tight text-foreground">
              {category.name}
            </span>
            {fromPrice !== null && (
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                desde {formatPrice(fromPrice)}
              </span>
            )}
          </span>
          <span className="truncate text-[13px] leading-snug text-muted-foreground">
            {previewNames.join(" · ")}
            {remaining > 0 && (
              <span className="text-muted-foreground/60"> +{remaining}</span>
            )}
          </span>
        </span>
      </button>

      {isOpen && (
        // scroll-pl-4 / scroll-pr-4: sin esto, scroll-snap alinea las
        // tarjetas al borde del scrollport e ignora el padding, así que
        // la primera y la última quedan pegadas al filo de la pantalla.
        <div className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 scroll-pr-4 gap-2.5 overflow-x-auto px-4 pb-4">
          {category.products.map((product) => (
            <ProductCardCompact
              key={product.id}
              product={product}
              onSelect={onSelectProduct}
              quantityInCart={cartQuantities[product.id] ?? 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
