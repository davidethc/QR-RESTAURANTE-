import { memo } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";
import type { ProductPromo } from "./product-card";

/**
 * Compact card for the horizontal row of an open category: photo on top
 * (only when the dish has one), name, price and a "+". The description
 * lives in the product sheet, one tap away, so every card in the row keeps
 * the same height.
 */
function ProductCardCompactBase({
  product,
  promo,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  promo?: ProductPromo;
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
        "relative flex w-[158px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm",
        "touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        soldOut ? "opacity-55" : "active:bg-secondary"
      )}
    >
      {product.image_url && (
        <div className="relative h-[96px] w-full overflow-hidden bg-secondary">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="158px"
            className={cn("object-cover", soldOut && "grayscale")}
          />
        </div>
      )}

      {quantityInCart > 0 && (
        <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-caption font-bold leading-tight text-primary-foreground">
          {quantityInCart}
        </span>
      )}

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3 className="font-display line-clamp-2 text-body font-bold leading-snug text-foreground">{product.name}</h3>
        {promo && !soldOut && (
          <span className="line-clamp-1 text-caption font-semibold text-money-in-soft-foreground">{promo.label}</span>
        )}
        <div className="mt-auto flex items-end justify-between gap-1 pt-1.5">
          <span className="flex flex-col">
            {promoPrice !== null && (
              <span className="text-caption tabular-nums text-muted-foreground line-through">{formatPrice(product.price)}</span>
            )}
            <span className="font-display text-body font-bold tabular-nums text-wine">
              {formatPrice(promoPrice ?? product.price)}
            </span>
          </span>
          {soldOut ? (
            <span className="text-caption font-bold uppercase tracking-wide text-muted-foreground">Agotado</span>
          ) : (
            <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="size-4" strokeWidth={2.75} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export const ProductCardCompact = memo(ProductCardCompactBase);
