"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { ProductCardCompact } from "./product-card-compact";
import type { ProductPromo } from "./product-card";
import type { PublicCategory, PublicProduct } from "@/types/menu";

const pressable =
  "touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

/**
 * One category of the menu, as its own block.
 *
 * Closed, it is an index entry: the full name (never cut), how many dishes,
 * the starting price and the first dish names. Open, its header sticks under
 * the search bar with a "Contraer" button and the dishes show as a
 * horizontal row of compact cards, so a category never pushes the rest of
 * the menu down.
 *
 * State changes paint instantly on purpose: the old 200 ms border/shadow
 * transition faded the border out before it turned green, which on a phone
 * read as "on, off, on".
 */
export function CategorySection({
  category,
  isOpen,
  onToggle,
  onCollapse,
  sectionRef,
  onSelectProduct,
  cartQuantities,
  promos,
}: {
  category: PublicCategory;
  isOpen: boolean;
  isExpanded?: boolean;
  onToggle: () => void;
  onCollapse: () => void;
  onShowAll?: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  onSelectProduct: (product: PublicProduct) => void;
  cartQuantities: Record<string, number>;
  promos?: Record<string, ProductPromo>;
}) {
  const count = category.products.length;
  const available = category.products.filter((p) => p.available);
  const fromPrice = available.length > 0 ? Math.min(...available.map((p) => p.price)) : null;
  const soldOutCount = count - available.length;
  const previewNames = category.products.slice(0, 3).map((p) => p.name);
  const remaining = count - previewNames.length;
  const panelId = `cat-panel-${category.id}`;
  const dishes = `${count} ${count === 1 ? "plato" : "platos"}`;

  return (
    <section
      ref={sectionRef}
      id={`cat-${category.id}`}
      data-section-id={category.id}
      data-open={isOpen ? "true" : "false"}
      className={cn(
        "rounded-2xl border bg-card",
        isOpen ? "border-primary/30 shadow-sm" : "border-border"
      )}
    >
      {isOpen ? (
        // Sticky header: `top` follows the measured bar height (see
        // useMenuNavigation), and it unsticks when the section ends.
        <div
          className="sticky z-[5] flex items-center gap-1 rounded-t-2xl border-b border-border bg-card/95 pr-2 backdrop-blur-sm supports-[not(backdrop-filter:blur(1px))]:bg-card"
          style={{ top: "var(--menu-bar-h, 0px)" }}
        >
          <h2 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded
              aria-controls={panelId}
              className={cn("flex min-h-16 w-full items-center gap-3 rounded-tl-2xl px-4 py-2.5 text-left", pressable)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-display break-words text-title font-bold leading-tight text-foreground">{category.name}</span>
                <span className="truncate text-meta leading-snug text-muted-foreground">
                  {dishes}
                  {soldOutCount > 0 && <> · {soldOutCount} agotado{soldOutCount === 1 ? "" : "s"}</>}
                </span>
              </span>
            </button>
          </h2>
          <button
            type="button"
            onClick={onCollapse}
            aria-controls={panelId}
            aria-label={`Contraer ${category.name}`}
            className={cn(
              "flex h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3.5 text-body-sm font-semibold text-foreground hover:bg-secondary active:bg-secondary",
              pressable,
              "focus-visible:outline-offset-2"
            )}
          >
            <ChevronUp aria-hidden className="size-4" strokeWidth={2.5} />
            Contraer
          </button>
        </div>
      ) : (
        <h2>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            aria-controls={panelId}
            className={cn("flex min-h-[84px] w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left hover:bg-secondary/40 active:bg-secondary/70", pressable)}
          >

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-display break-words text-title font-bold leading-tight text-foreground">{category.name}</span>
              <span className="truncate text-meta leading-snug text-muted-foreground">
                {dishes}
                {fromPrice !== null && (
                  <>
                    {" · desde "}
                    <span className="font-semibold tabular-nums text-foreground">{formatPrice(fromPrice)}</span>
                  </>
                )}
              </span>
              <span className="line-clamp-1 text-caption leading-snug text-muted-foreground">
                {previewNames.join(", ")}
                {remaining > 0 && ` y ${remaining} más`}
              </span>
            </span>

            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
            >
              <ChevronDown className="size-4" strokeWidth={2.5} />
            </span>
          </button>
        </h2>
      )}

      {isOpen && (
        <div
          id={panelId}
          className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 scroll-pr-4 gap-2.5 overflow-x-auto px-4 py-4"
        >
          {category.products.map((product) => (
            <ProductCardCompact
              key={product.id}
              product={product}
              promo={promos?.[product.id]}
              onSelect={onSelectProduct}
              quantityInCart={cartQuantities[product.id] ?? 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
