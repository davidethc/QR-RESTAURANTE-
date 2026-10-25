import { memo } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";
import type { ProductPromo } from "./product-card";

/**
 * Dish card for the horizontal row of an open category. No box and no
 * border: a rounded photo (or the category icon on a soft tile, so every
 * card in the row has the same shape) with the name and price underneath.
 * The "+" sits on the photo corner. The description lives in the product
 * sheet, one tap away.
 */
function ProductCardCompactBase({
  product,
  promo,
  placeholderIcon,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  promo?: ProductPromo;
  placeholderIcon?: string;
  onSelect?: (product: PublicProduct) => void;
  quantityInCart?: number;
}) {
  const soldOut = !product.available;
  const promoPrice = !soldOut && promo?.price != null && promo.price < product.price ? promo.price : null;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect?.(product)}
      className={cn(
        "group flex w-[150px] shrink-0 snap-start flex-col gap-2 rounded-2xl text-left",
        "touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
        soldOut && "opacity-55"
      )}
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-secondary">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="150px"
            className={cn(
              "object-cover transition-transform duration-200 group-active:scale-[0.97] motion-reduce:transition-none",
              soldOut && "grayscale"
            )}
          />
        ) : (
          <span aria-hidden className="emoji-tile flex size-full items-center justify-center text-[2.75rem] leading-none">
            <span className="emoji-3d">{placeholderIcon ?? "🍽️"}</span>
          </span>
        )}

        {quantityInCart > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-caption font-bold leading-tight text-primary-foreground shadow-sm">
            {quantityInCart} en tu pedido
          </span>
        )}

        {soldOut ? (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-card/95 py-1 text-center text-caption font-bold uppercase tracking-wide text-muted-foreground">
            Agotado hoy
          </span>
        ) : (
          <span
            aria-hidden
            className="absolute bottom-2 right-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
          >
            <Plus className="size-5" strokeWidth={2.75} />
          </span>
        )}
      </span>

      <span className="flex flex-col gap-0.5 px-0.5">
        <span className="font-display line-clamp-2 text-body font-semibold leading-snug text-foreground">{product.name}</span>
        {promo && !soldOut && (
          <span className="line-clamp-1 text-caption font-semibold text-money-in-soft-foreground">{promo.label}</span>
        )}
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-body font-bold tabular-nums text-wine">{formatPrice(promoPrice ?? product.price)}</span>
          {promoPrice !== null && (
            <span className="text-caption tabular-nums text-muted-foreground line-through">{formatPrice(product.price)}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export const ProductCardCompact = memo(ProductCardCompactBase);
