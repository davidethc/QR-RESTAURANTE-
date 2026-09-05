"use client";

import { useRef } from "react";
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
  // Guardia contra el doble toque: en un celular es facilísimo que el
  // dedo registre dos veces, y sin esto un combo entraba cuatro veces al
  // carrito.
  const lastTap = useRef(0);
  function onceGuard(fn: () => void) {
    const now = Date.now();
    if (now - lastTap.current < 400) return;
    lastTap.current = now;
    fn();
  }

  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5 px-4">
      <p className="flex w-fit items-center gap-1.5 rounded-md bg-honey px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-honey-foreground">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
        Combos del día
      </p>

      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-2.5 overflow-x-auto px-4 pb-1">
        {suggestions.map((s, i) =>
          s.type === "combo" ? (
            <button
              key={`combo-${s.dish.id}-${s.drink.id}`}
              type="button"
              onClick={() => onceGuard(() => onAddCombo(s.dish, s.drink))}
              className="group flex w-[190px] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl bg-card p-3.5 text-left transition-transform duration-200 active:scale-[0.97]"
            >
              <span className="flex flex-col gap-1">
                <span className="font-display text-[15px] font-bold leading-snug text-foreground">
                  {s.dish.name}
                </span>
                <span className="flex items-center gap-1 text-[13px] leading-snug text-muted-foreground">
                  <Plus className="h-3 w-3 shrink-0 text-primary" strokeWidth={3} />
                  {s.drink.name}
                </span>
              </span>

              <span className="flex items-end justify-between gap-2">
                <span className="flex items-baseline gap-1.5 leading-none">
                  <span className="font-display text-[20px] font-bold tabular-nums text-wine">
                    {formatPrice(s.comboPrice)}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
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
              onClick={() => onceGuard(() => onSelectProduct(s.product))}
              className="group flex w-[150px] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl bg-card p-3.5 text-left transition-transform duration-200 active:scale-[0.97]"
            >
              <span className="font-display text-[15px] font-bold leading-snug text-foreground">
                {s.product.name}
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="font-display text-[20px] font-bold tabular-nums text-wine">
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
