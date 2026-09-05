"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { ProductCard, ProductCardCompact } from "./product-card";
import type { PublicCategory } from "@/types/menu";

/**
 * Una categoría de la carta, en acordeón.
 *
 * Cerrada solo muestra su encabezado — pero un encabezado que ya
 * informa (cuántos platos y desde qué precio), para que el cliente
 * decida si le interesa sin tener que abrirla a ciegas.
 *
 * Al abrirse, los platos salen en una fila horizontal deslizable: se
 * ven varios de un vistazo y la categoría no empuja el resto de la
 * carta hacia abajo. Como un carrusel esconde lo que queda a la
 * derecha, queda "Ver todos" para pasar a la lista vertical completa.
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
  const [showAll, setShowAll] = useState(false);

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

      {isOpen &&
        (showAll ? (
          <div className="flex flex-col gap-2 px-4 pt-2">
            {category.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={onSelectProduct}
                quantityInCart={cartQuantities[product.id] ?? 0}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="min-h-10 rounded-xl border border-dashed border-primary/40 text-[13px] font-semibold text-primary active:bg-primary/5"
            >
              Ver en fila
            </button>
          </div>
        ) : (
          <>
            {/* scroll-pl-4: sin esto, scroll-snap alinea la primera
                tarjeta al borde del scrollport e ignora el padding. */}
            <div className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 gap-2.5 overflow-x-auto px-4 pb-1 pt-2">
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
            {count > 2 && (
              <div className="px-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="min-h-10 w-full rounded-xl border border-border/70 bg-card text-[13px] font-semibold text-primary active:bg-secondary"
                >
                  Ver los {count} en lista
                </button>
              </div>
            )}
          </>
        ))}
    </section>
  );
}
