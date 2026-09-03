import Image from "next/image";
import { UtensilsCrossed, Plus } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

export function ProductCard({
  product,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  onSelect?: (product: PublicProduct) => void;
  quantityInCart?: number;
}) {
  const soldOut = !product.available;

  return (
    <article
      role={soldOut ? undefined : "button"}
      tabIndex={soldOut ? undefined : 0}
      onClick={soldOut ? undefined : () => onSelect?.(product)}
      onKeyDown={
        soldOut
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(product);
              }
            }
      }
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3 text-left",
        soldOut ? "opacity-60" : "cursor-pointer active:bg-muted"
      )}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{product.name}</span>
            {quantityInCart > 0 && (
              <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary">
                {quantityInCart} en carrito
              </span>
            )}
          </h3>
          <span className="shrink-0 text-sm font-semibold text-wine">
            {formatPrice(product.price)}
          </span>
        </div>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {product.description}
          </p>
        )}
        {soldOut && (
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            Actualmente no disponible
          </span>
        )}
      </div>

      {!soldOut && (
        <div className="flex shrink-0 items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="h-4 w-4" />
          </div>
        </div>
      )}
    </article>
  );
}
