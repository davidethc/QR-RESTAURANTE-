import Image from "next/image";
import { Sparkles, UtensilsCrossed } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

/**
 * Fila de "destacados" justo debajo del buscador/categorías — el
 * cliente los ve antes de elegir una categoría, no solo si llega a
 * encontrarlos navegando. El restaurante decide qué aparece aquí
 * (interruptor "Destacado" en el panel de Carta), no se adivina.
 */
export function SuggestionsRow({
  products,
  onSelect,
}: {
  products: PublicProduct[];
  onSelect: (product: PublicProduct) => void;
}) {
  if (products.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-accent/30 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Sugerencias para ti
      </p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelect(product)}
            className="flex w-32 shrink-0 flex-col items-start rounded-xl border bg-card p-2 text-left active:bg-muted"
          >
            <div className="relative h-20 w-full overflow-hidden rounded-lg bg-muted">
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs font-medium text-foreground">
              {product.name}
            </p>
            <p className="text-xs font-semibold text-wine">
              {formatPrice(product.price)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
