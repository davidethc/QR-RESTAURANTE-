"use client";

import { memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { ProductCardCompact } from "./product-card-compact";
import { SwipeHint, useSwipeHint } from "./swipe-hint";
import type { ProductPromo } from "./product-card";
import type { PublicCategory, PublicProduct } from "@/types/menu";

const pressable =
  "touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

type SelectProduct = (product: PublicProduct) => void;

interface CategorySectionProps {
  category: PublicCategory;
  isOpen: boolean;
  /** Stable callbacks that take the id, so the memo holds across renders. */
  onToggle: (id: string) => void;
  onCollapse: (id: string) => void;
  sectionRef: (el: HTMLElement | null) => void;
  onSelectProduct: SelectProduct;
  cartQuantities: Record<string, number>;
  promos?: Record<string, ProductPromo>;
}

/**
 * One category of the menu, as its own block.
 *
 * Closed, it is an index entry: the full name (never cut), how many dishes,
 * the starting price and the first dish names. Open, its header sticks under
 * the search bar with a "Contraer" button and the dishes show as a
 * horizontal row of compact cards, so a category never pushes the rest of
 * the menu down.
 *
 * Memoized: the scroll-spy and the search box re-render the menu often, and
 * none of that changes a section. State changes paint instantly on purpose:
 * the old 200 ms border/shadow transition faded the border out before it
 * turned green, which on a phone read as "on, off, on".
 */
function CategorySectionBase({
  category,
  isOpen,
  onToggle,
  onCollapse,
  sectionRef,
  onSelectProduct,
  cartQuantities,
  promos,
}: CategorySectionProps) {
  const icon = getCategoryIcon(category.name);
  const panelId = `cat-panel-${category.id}`;

  return (
    <section
      ref={sectionRef}
      id={`cat-${category.id}`}
      data-section-id={category.id}
      data-open={isOpen ? "true" : "false"}
      className={cn("rounded-2xl", !isOpen && "border border-border/70 bg-card shadow-card")}
    >
      {isOpen ? (
        <>
          <OpenHeader category={category} icon={icon} panelId={panelId} onToggle={onToggle} onCollapse={onCollapse} />
          <DishRow
            id={panelId}
            products={category.products}
            icon={icon}
            onSelectProduct={onSelectProduct}
            cartQuantities={cartQuantities}
            promos={promos}
          />
        </>
      ) : (
        <ClosedHeader category={category} icon={icon} panelId={panelId} onToggle={onToggle} />
      )}
    </section>
  );
}

export const CategorySection = memo(CategorySectionBase);

function dishCount(n: number) {
  return `${n} ${n === 1 ? "plato" : "platos"}`;
}

/** Sticky header of an open section; `top` follows the measured bar height (see useMenuNavigation). */
function OpenHeader({
  category,
  icon,
  panelId,
  onToggle,
  onCollapse,
}: {
  category: PublicCategory;
  icon: string;
  panelId: string;
  onToggle: (id: string) => void;
  onCollapse: (id: string) => void;
}) {
  const soldOut = category.products.filter((p) => !p.available).length;

  return (
    <div
      className="sticky z-[5] flex items-center gap-1 bg-background/95 pr-2 backdrop-blur-sm supports-[not(backdrop-filter:blur(1px))]:bg-background"
      style={{ top: "var(--menu-bar-h, 0px)" }}
    >
      <h2 className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onToggle(category.id)}
          aria-expanded
          aria-controls={panelId}
          className={cn("flex min-h-16 w-full items-center gap-3 rounded-tl-2xl px-4 py-2.5 text-left", pressable)}
        >
          <span aria-hidden className="emoji-tile flex size-10 shrink-0 items-center justify-center rounded-xl text-title leading-none">
            <span className="emoji-3d">{icon}</span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-display break-words text-title font-bold leading-tight text-foreground">{category.name}</span>
            <span className="truncate text-meta leading-snug text-muted-foreground">
              {dishCount(category.products.length)}
              {soldOut > 0 && <> · {soldOut} agotado{soldOut === 1 ? "" : "s"}</>}
            </span>
          </span>
        </button>
      </h2>
      <button
        type="button"
        onClick={() => onCollapse(category.id)}
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
  );
}

/** Closed section: an index entry with the starting price and the first dish names. */
function ClosedHeader({
  category,
  icon,
  panelId,
  onToggle,
}: {
  category: PublicCategory;
  icon: string;
  panelId: string;
  onToggle: (id: string) => void;
}) {
  const { products } = category;
  let fromPrice: number | null = null;
  for (const p of products) if (p.available && (fromPrice === null || p.price < fromPrice)) fromPrice = p.price;
  const previewNames = products.slice(0, 3).map((p) => p.name);
  const remaining = products.length - previewNames.length;

  return (
    <h2>
      <button
        type="button"
        onClick={() => onToggle(category.id)}
        aria-expanded={false}
        aria-controls={panelId}
        className={cn("flex min-h-[84px] w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left hover:bg-secondary/40 active:bg-secondary/70", pressable)}
      >
        <span aria-hidden className="emoji-tile flex size-12 shrink-0 items-center justify-center rounded-xl text-title-lg leading-none">
          <span className="emoji-3d">{icon}</span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display break-words text-title font-bold leading-tight text-foreground">{category.name}</span>
          <span className="truncate text-meta leading-snug text-muted-foreground">
            {dishCount(products.length)}
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
  );
}

/** Horizontal row of compact dish cards, with the "Desliza" hint while it overflows. */
function DishRow({
  id,
  products,
  icon,
  onSelectProduct,
  cartQuantities,
  promos,
}: {
  id: string;
  products: readonly PublicProduct[];
  icon: string;
  onSelectProduct: SelectProduct;
  cartQuantities: Record<string, number>;
  promos?: Record<string, ProductPromo>;
}) {
  const { attachRow, showHint } = useSwipeHint(id);

  return (
    <div className="relative">
      <div
        ref={attachRow}
        id={id}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 scroll-pr-4 gap-3 overflow-x-auto px-4 pb-3 pt-2"
      >
        {products.map((product) => (
          <ProductCardCompact
            key={product.id}
            product={product}
            promo={promos?.[product.id]}
            placeholderIcon={icon}
            onSelect={onSelectProduct}
            quantityInCart={cartQuantities[product.id] ?? 0}
          />
        ))}
      </div>
      {showHint && <SwipeHint />}
    </div>
  );
}
