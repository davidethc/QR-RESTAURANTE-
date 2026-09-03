"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";
import type { PublicCategory } from "@/types/menu";

const PREVIEW_LIMIT = 8;

/**
 * Una categoría de la carta: se abre y cierra tocando su nombre
 * (acordeón), y si tiene más de 8 platos se acorta con "Ver más" en
 * vez de forzar un scroll larguísimo desde el primer vistazo.
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

  const hasMore = category.products.length > PREVIEW_LIMIT;
  const visibleProducts =
    hasMore && !showAll
      ? category.products.slice(0, PREVIEW_LIMIT)
      : category.products;

  return (
    <section ref={sectionRef} id={`cat-${category.id}`} className="scroll-mt-36">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 py-2 text-left"
      >
        <span className="text-base font-semibold text-foreground">
          {category.name}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="flex flex-col gap-2 pb-2">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={onSelectProduct}
              quantityInCart={cartQuantities[product.id] ?? 0}
            />
          ))}

          {hasMore && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-lg border border-dashed py-2.5 text-center text-sm font-medium text-primary"
            >
              Ver {category.products.length - PREVIEW_LIMIT} platos más
            </button>
          )}
        </div>
      )}
    </section>
  );
}
