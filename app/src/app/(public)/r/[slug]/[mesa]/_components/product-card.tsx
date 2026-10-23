import { memo } from "react";
import Image from "next/image";
import { Ban, Plus, ShoppingBag } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, cn } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

/**
 * One dish of the menu, as a full-width row.
 *
 * - With a photo, the photo leads (88px square, the thing that sells).
 *   Without one, no gray placeholder is drawn: an empty frame reads as a
 *   broken image. The row stays pure text and still lines up.
 * - Price sits under the name, in the restaurant's price color, so the
 *   eye reads "what" then "how much" in one vertical pass.
 * - Sold out is an explicit chip with an icon, and the row is disabled:
 *   never just a faded card the customer has to interpret.
 * - The "+" is the only filled control in the row: tapping anywhere opens
 *   the dish, the "+" says that this is how you add it.
 */
function ProductCardBase({
  product,
  categoryName,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  /** Only in search results: outside its category, "Café con leche" or
   *  "Pizza pequeña" needs context to say where it came from. */
  categoryName?: string;
  onSelect?: (product: PublicProduct) => void;
  quantityInCart?: number;
}) {
  const soldOut = !product.available;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect?.(product)}
      className={cn(
        "group flex w-full items-start gap-3.5 bg-card px-4 py-3.5 text-left transition-colors duration-150 ease-out focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none",
        soldOut ? "cursor-not-allowed" : "cursor-pointer hover:bg-secondary/60 active:bg-secondary"
      )}
    >
      {product.image_url && (
        <span className="relative size-[88px] shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          <Image
            src={product.image_url}
            alt=""
            fill
            sizes="88px"
            className={cn("object-cover", soldOut && "grayscale")}
          />
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <h3
          className={cn(
            "font-display text-body-lg font-bold leading-snug",
            soldOut ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {product.name}
        </h3>

        {product.description && (
          <span className="line-clamp-2 text-meta leading-relaxed text-muted-foreground">
            {product.description}
          </span>
        )}

        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "font-display mr-1 text-body-lg font-bold tabular-nums",
              soldOut ? "text-muted-foreground line-through decoration-1" : "text-wine"
            )}
          >
            {formatPrice(product.price)}
          </span>
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
          className="clay clay-primary mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-150 ease-out group-active:scale-95 motion-reduce:transition-none"
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

/**
 * Memoized on purpose: `cartQuantities` in MenuBrowser changes with every
 * dish added, so without this adding ONE product repainted every card of
 * every open category.
 */
export const ProductCard = memo(ProductCardBase);
