"use client";

import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { visibleProducts } from "@/lib/menu-navigation";
import { ProductCard, type ProductPromo } from "./product-card";
import type { PublicCategory, PublicProduct } from "@/types/menu";

const pressable =
  "touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

/**
 * One category of the menu, as its own block.
 *
 * Closed, it is an index entry: icon, name, how many dishes, the starting
 * price and a strip of up to three photos — what makes you hungry enough to
 * open it. Open, its header sticks under the search bar with a "Contraer"
 * button, so a long list can be folded from anywhere; the dishes follow as
 * full-width rows, the first six and then "Ver N más".
 *
 * State changes paint instantly on purpose: the old 200 ms border/shadow
 * transition faded the border out before it turned green, which on a phone
 * read as "on, off, on".
 */
export function CategorySection({
  category,
  isOpen,
  isExpanded,
  onToggle,
  onCollapse,
  onShowAll,
  sectionRef,
  onSelectProduct,
  cartQuantities,
  promos,
}: {
  category: PublicCategory;
  isOpen: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onCollapse: () => void;
  onShowAll: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  onSelectProduct: (product: PublicProduct) => void;
  cartQuantities: Record<string, number>;
  promos?: Record<string, ProductPromo>;
}) {
  const count = category.products.length;
  const available = category.products.filter((p) => p.available);
  const fromPrice = available.length > 0 ? Math.min(...available.map((p) => p.price)) : null;
  const soldOutCount = count - available.length;
  const icon = getCategoryIcon(category.name);
  const photos = category.products.filter((p) => p.image_url).slice(0, 3);
  const previewNames = category.products.slice(0, 3).map((p) => p.name);
  const remaining = count - previewNames.length;
  const { shown, hidden } = visibleProducts(category.products, isExpanded);
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
              <span aria-hidden className="emoji-tile flex size-10 shrink-0 items-center justify-center rounded-xl text-title leading-none">
                <span className="emoji-3d">{icon}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-display truncate text-title font-bold leading-tight text-foreground">{category.name}</span>
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
            <span aria-hidden className="emoji-tile flex size-12 shrink-0 items-center justify-center rounded-xl text-title-lg leading-none">
              <span className="emoji-3d">{icon}</span>
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-display truncate text-title font-bold leading-tight text-foreground">{category.name}</span>
              <span className="truncate text-meta leading-snug text-muted-foreground">
                {dishes}
                {fromPrice !== null && (
                  <>
                    {" · desde "}
                    <span className="font-semibold tabular-nums text-foreground">{formatPrice(fromPrice)}</span>
                  </>
                )}
              </span>
              {photos.length === 0 && (
                <span className="truncate text-caption leading-snug text-muted-foreground">
                  {previewNames.join(", ")}
                  {remaining > 0 && ` y ${remaining} más`}
                </span>
              )}
            </span>

            {photos.length > 0 && (
              <span aria-hidden className="flex shrink-0 -space-x-3">
                {photos.map((p) => (
                  <span key={p.id} className="relative size-11 overflow-hidden rounded-xl bg-secondary ring-2 ring-card">
                    <Image src={p.image_url!} alt="" fill sizes="44px" className="object-cover" />
                  </span>
                ))}
              </span>
            )}

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
        <div id={panelId} className="overflow-hidden rounded-b-2xl">
          <div className="flex flex-col divide-y divide-border">
            {shown.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                placeholderIcon={photos.length > 0 ? icon : undefined}
                promo={promos?.[product.id]}
                onSelect={onSelectProduct}
                quantityInCart={cartQuantities[product.id] ?? 0}
              />
            ))}
          </div>
          {hidden > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className={cn(
                "flex min-h-14 w-full items-center justify-center gap-1.5 border-t border-border text-body font-semibold text-primary hover:bg-secondary/50 active:bg-secondary",
                pressable
              )}
            >
              Ver {hidden} {hidden === 1 ? "plato más" : "platos más"}
              <ChevronDown aria-hidden className="size-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
