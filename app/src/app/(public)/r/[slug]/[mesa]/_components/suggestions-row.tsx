import { Sparkles, Plus } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { MenuSuggestion } from "@/lib/suggestions";
import type { PublicProduct } from "@/types/menu";

/**
 * Fila de combos/destacados justo debajo del buscador — el cliente los
 * ve antes de elegir una categoría. Nunca está vacía (ver
 * lib/suggestions.ts).
 *
 * Diseño: son tarjetas tipográficas, no miniaturas de foto. Antes cada
 * combo mostraba dos recuadros grises con un ícono de cubiertos (los
 * platos no tienen foto todavía) y parecían imágenes rotas. Ahora el
 * protagonista es lo único que de verdad importa para decidir: qué
 * lleva el combo y cuánto cuesta junto.
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
    <section className="flex flex-col gap-2.5 px-4">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-wine">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
        Combos del día
      </p>

      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-2.5 overflow-x-auto px-4 pb-1">
        {suggestions.map((s, i) =>
          s.type === "combo" ? (
            <button
              key={`combo-${s.dish.id}-${s.drink.id}`}
              type="button"
              onClick={() => onAddCombo(s.dish, s.drink)}
              className="group flex w-[190px] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-transform duration-200 active:scale-[0.97]"
            >
              <span className="flex flex-col gap-1">
                <span className="font-display text-[15px] font-semibold leading-snug text-foreground">
                  {s.dish.name}
                </span>
                <span className="flex items-center gap-1 text-[13px] leading-snug text-muted-foreground">
                  <Plus className="h-3 w-3 shrink-0 text-primary" strokeWidth={3} />
                  {s.drink.name}
                </span>
              </span>

              <span className="flex items-end justify-between gap-2">
                <span className="flex items-baseline gap-1.5 leading-none">
                  <span className="font-display text-xl font-semibold tabular-nums text-wine">
                    {formatPrice(s.comboPrice)}
                  </span>
                  <span className="text-[10.5px] font-medium text-muted-foreground">
                    los dos
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center clay clay-primary rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </span>
            </button>
          ) : (
            <button
              key={s.product.id ?? i}
              type="button"
              onClick={() => onSelectProduct(s.product)}
              className="group flex w-[150px] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-transform duration-200 active:scale-[0.97]"
            >
              <span className="font-display text-[15px] font-semibold leading-snug text-foreground">
                {s.product.name}
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="font-display text-xl font-semibold tabular-nums text-wine">
                  {formatPrice(s.product.price)}
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center clay clay-primary rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </span>
            </button>
          )
        )}
      </div>
    </section>
  );
}
