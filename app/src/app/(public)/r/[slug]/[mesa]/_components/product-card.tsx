import { memo } from "react";
import Image from "next/image";
import { Ban, Plus, ShoppingBag, Tag } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, cn } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

/** Promotion shown on a dish. `price` is null when the promo is not a plain discount (2x1…). */
export interface ProductPromo {
  label: string;
  price: number | null;
}

/**
 * One dish of the menu, as a full-width row.
 *
 * - The photo box is always the same 96px square, so rows line up and the
 *   page never shifts while photos load. In a section that has photos, a
 *   dish without one gets the category emoji on a soft tile instead of a
 *   broken-looking gray frame; a section with no photos stays text rows.
 * - Name, two lines of description, then the price in the price color.
 *   A promo shows the list price struck through and its label.
 * - Sold out is an explicit chip and the row is disabled.
 * - The "+" is a 48px target and the only filled control in the row.
 */
function ProductCardBase({
  product,
  categoryName,
  placeholderIcon,
  promo,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  /** Only in search results: outside its category, "Café con leche" needs context. */
  categoryName?: string;
  /** Emoji for the photo box when the dish has no photo. Without it, a dish
   *  with no photo renders as a text row (a menu with no photos at all
   *  should not repeat the same emoji on every row). */
  placeholderIcon?: string;
  promo?: ProductPromo;
  onSelect?: (product: PublicProduct) => void;
  quantityInCart?: number;
}) {
  const soldOut = !product.available;
  const promoPrice = !soldOut && promo?.price != null && promo.price < product.price ? promo.price : null;
  const showBox = Boolean(product.image_url || placeholderIcon);

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect?.(product)}
      className={cn(
        "group flex w-full touch-manipulation items-start gap-3.5 bg-card px-4 py-4 text-left [-webkit-tap-highlight-color:transparent] focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        soldOut ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/50 active:bg-secondary"
      )}
    >
      {showBox && (
        <span className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt=""
              fill
              sizes="96px"
              className={cn("object-cover", soldOut && "opacity-60 grayscale")}
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                "emoji-tile flex size-full items-center justify-center text-[2.5rem] leading-none",
                soldOut && "opacity-60 grayscale"
              )}
            >
              <span className="emoji-3d">{placeholderIcon}</span>
            </span>
          )}
        </span>
      )}

      <span className={cn("flex min-w-0 flex-1 flex-col", showBox && "min-h-24")}>
        <h3
          className={cn(
            "font-display line-clamp-2 text-body-lg font-bold leading-snug text-balance",
            soldOut ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {product.name}
        </h3>

        {product.description && (
          <span className="mt-1 line-clamp-2 text-meta leading-relaxed text-muted-foreground">
            {product.description}
          </span>
        )}

        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-2">
          {promoPrice !== null ? (
            <>
              <span className="font-display text-body-lg font-bold tabular-nums text-wine">{formatPrice(promoPrice)}</span>
              <span className="text-meta tabular-nums text-muted-foreground line-through decoration-1">
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span
              className={cn(
                "font-display text-body-lg font-bold tabular-nums",
                soldOut ? "text-muted-foreground line-through decoration-1" : "text-wine"
              )}
            >
              {formatPrice(product.price)}
            </span>
          )}
          {promo && !soldOut && (
            <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-honey/60 bg-honey-soft px-2 text-caption font-semibold text-honey-soft-foreground">
              <Tag aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
              <span className="truncate">{promo.label}</span>
            </span>
          )}
          {soldOut && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-secondary px-2 text-caption font-semibold text-muted-foreground">
              <Ban aria-hidden className="size-3.5" strokeWidth={2.5} />
              Agotado hoy
            </span>
          )}
          {quantityInCart > 0 && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-money-in-border bg-money-in-soft px-2 text-caption font-semibold text-money-in-soft-foreground">
              <ShoppingBag aria-hidden className="size-3.5" strokeWidth={2.5} />
              {quantityInCart} en tu pedido
            </span>
          )}
          {categoryName && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-secondary px-2 text-caption font-medium text-muted-foreground">
              <span aria-hidden>{getCategoryIcon(categoryName)}</span>
              {categoryName}
            </span>
          )}
        </span>
      </span>

      {!soldOut && (
        <span
          aria-hidden="true"
          className="clay clay-primary flex size-12 shrink-0 items-center justify-center self-center rounded-full bg-primary text-primary-foreground group-active:scale-95"
        >
          <Plus className="size-5" strokeWidth={2.75} />
        </span>
      )}
    </button>
  );
}

/**
 * Memoized on purpose: `cartQuantities` changes with every dish added, so
 * without this adding ONE product repainted every row of every open section.
 */
export const ProductCard = memo(ProductCardBase);
