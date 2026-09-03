import Image from "next/image";
import { Sparkles, UtensilsCrossed, Plus } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { MenuSuggestion } from "@/lib/suggestions";
import type { PublicProduct } from "@/types/menu";

function Thumb({ product, size }: { product: PublicProduct; size: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-muted"
      style={{ width: size, height: size }}
    >
      {product.image_url ? (
        <Image
          src={product.image_url}
          alt={product.name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/**
 * Fila de "destacados"/combos justo debajo del buscador/categorías —
 * el cliente los ve antes de elegir una categoría. Nunca está vacía
 * (ver lib/suggestions.ts): si el restaurante no marcó nada a mano,
 * arma combos plato+bebida con el precio de los dos juntos, ordenados
 * de más barato a más caro.
 */
export function SuggestionsRow({
  suggestions,
  onSelectProduct,
  onAddCombo,
}: {
  suggestions: MenuSuggestion[];
  onSelectProduct: (product: PublicProduct) => void;
  onAddCombo: (dish: PublicProduct, drink: PublicProduct) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-accent/30 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Sugerencias para ti
      </p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
        {suggestions.map((s, i) =>
          s.type === "combo" ? (
            <button
              key={`combo-${s.dish.id}-${s.drink.id}`}
              type="button"
              onClick={() => onAddCombo(s.dish, s.drink)}
              className="flex w-40 shrink-0 flex-col items-start gap-1.5 rounded-xl border bg-card p-2 text-left active:bg-muted"
            >
              <div className="flex items-center gap-1">
                <Thumb product={s.dish} size={56} />
                <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                <Thumb product={s.drink} size={56} />
              </div>
              <p className="line-clamp-2 text-xs font-medium text-foreground">
                {s.dish.name} + {s.drink.name}
              </p>
              <p className="text-xs font-semibold text-wine">
                {formatPrice(s.comboPrice)}
              </p>
            </button>
          ) : (
            <button
              key={s.product.id ?? i}
              type="button"
              onClick={() => onSelectProduct(s.product)}
              className="flex w-32 shrink-0 flex-col items-start rounded-xl border bg-card p-2 text-left active:bg-muted"
            >
              <Thumb product={s.product} size={112} />
              <p className="mt-1.5 line-clamp-2 text-xs font-medium text-foreground">
                {s.product.name}
              </p>
              <p className="text-xs font-semibold text-wine">
                {formatPrice(s.product.price)}
              </p>
            </button>
          )
        )}
      </div>
    </div>
  );
}
