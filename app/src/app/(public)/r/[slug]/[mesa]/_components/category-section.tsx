"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { ProductCard, ProductCardCompact } from "./product-card";
import type { PublicCategory } from "@/types/menu";

/**
 * Una categoría de la carta.
 *
 * Por defecto muestra sus platos en una fila horizontal deslizable
 * (se siente app, ocupa poco alto y deja ver varias categorías de un
 * vistazo). El riesgo conocido de un carrusel es que el cliente no
 * sabe qué hay escondido a la derecha — por eso cada categoría lleva
 * "Ver todos (N)", que despliega la lista completa en vertical. Así
 * ningún plato queda enterrado sin salida.
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

  return (
    <section
      ref={sectionRef}
      id={`cat-${category.id}`}
      className="scroll-mt-36"
    >
      <div className="flex items-center justify-between gap-2 px-4">
        <h2 className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-lg leading-none">
            {getCategoryIcon(category.name)}
          </span>
          <span className="font-display truncate text-[17px] font-semibold leading-tight text-foreground">
            {category.name}
          </span>
        </h2>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[13px] font-semibold text-primary active:bg-primary/10"
        >
          {isOpen ? "Ver menos" : `Ver todos (${count})`}
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              isOpen && "rotate-90"
            )}
            strokeWidth={2.5}
          />
        </button>
      </div>

      {isOpen ? (
        <div className="flex flex-col gap-2 px-4 pt-3">
          {category.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={onSelectProduct}
              quantityInCart={cartQuantities[product.id] ?? 0}
            />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 pt-3">
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
