"use client";

import { ChevronDown } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { ProductCard } from "./product-card";
import type { PublicCategory } from "@/types/menu";

/**
 * One category of the menu, as its own bordered block.
 *
 * Closed, it is an index entry: icon, name, how many dishes and the
 * starting price, plus the first dish names ("Tigrillo · Bolón") because
 * that is what makes you hungry enough to open it. Open, the dishes are a
 * vertical list inside the same block, separated by 1px rules: nothing is
 * hidden off-screen in a horizontal scroller, and every block reads as a
 * unit separate from the next one.
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
  const available = category.products.filter((p) => p.available);
  const fromPrice =
    available.length > 0 ? Math.min(...available.map((p) => p.price)) : null;
  const soldOutCount = count - available.length;

  // Three names give the flavor of the category; more get cut on screen.
  const previewNames = category.products.slice(0, 3).map((p) => p.name);
  const remaining = count - previewNames.length;
  const panelId = `cat-panel-${category.id}`;

  return (
    <section
      ref={sectionRef}
      id={`cat-${category.id}`}
      className={cn(
        "scroll-mt-[8.5rem] overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        isOpen ? "border-primary/35 shadow-sm" : "border-border"
      )}
    >
      {/* h2 wrapping the button: the WAI-ARIA accordion pattern, and the
          heading level between the restaurant (h1) and the dishes (h3). */}
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary/60 active:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <span
            aria-hidden
            className="emoji-tile flex size-12 shrink-0 items-center justify-center rounded-xl text-title-lg leading-none"
          >
            <span className="emoji-3d">{getCategoryIcon(category.name)}</span>
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-display truncate text-title font-bold leading-tight text-foreground">
              {category.name}
            </span>
            <span className="truncate text-meta leading-snug text-muted-foreground">
              {isOpen ? (
                <>
                  {count} {count === 1 ? "plato" : "platos"}
                  {fromPrice !== null && <> · desde {formatPrice(fromPrice)}</>}
                  {soldOutCount > 0 && <> · {soldOutCount} agotado{soldOutCount === 1 ? "" : "s"}</>}
                </>
              ) : (
                <>
                  {previewNames.join(" · ")}
                  {remaining > 0 && ` +${remaining}`}
                </>
              )}
            </span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            {!isOpen && fromPrice !== null && (
              <span className="text-caption font-medium tabular-nums text-muted-foreground">
                desde{" "}
                <span className="font-semibold text-foreground">{formatPrice(fromPrice)}</span>
              </span>
            )}
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-200 ease-out motion-reduce:transition-none",
                isOpen
                  ? "rotate-180 border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              <ChevronDown aria-hidden className="size-4" strokeWidth={2.5} />
            </span>
          </span>
        </button>
      </h2>

      {isOpen && (
        <div
          id={panelId}
          className="flex flex-col divide-y divide-border border-t border-border"
        >
          {category.products.map((product) => (
            <ProductCard
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
