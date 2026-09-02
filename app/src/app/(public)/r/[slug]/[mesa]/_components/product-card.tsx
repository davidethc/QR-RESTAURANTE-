import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

export function ProductCard({ product }: { product: PublicProduct }) {
  const soldOut = !product.available;

  return (
    <article
      className={`flex gap-3 rounded-xl border bg-card p-3 ${
        soldOut ? "opacity-60" : ""
      }`}
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
          <h3 className="truncate text-sm font-medium text-foreground">
            {product.name}
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
    </article>
  );
}
