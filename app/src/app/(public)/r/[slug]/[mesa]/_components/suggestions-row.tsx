"use client";

import { useCallback, useRef } from "react";
import { Sparkles, Plus } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { MenuSuggestion } from "@/lib/suggestions";
import type { PublicProduct } from "@/types/menu";

const cardClass =
  "group flex shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-[transform,border-color] duration-150 ease-out hover:border-primary/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * Combos and featured dishes, right under the search, before the customer
 * picks a category. Never empty (see lib/suggestions.ts). Typographic
 * cards on purpose: what matters to decide is what the combo has and how
 * much it costs together.
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
  // Double-tap guard: on a phone the finger easily registers twice, and
  // without this a combo entered the cart four times.
  const lastTap = useRef(0);
  // useCallback, not a loose function: React Compiler would analyse it as
  // render code and flag Date.now() as impure. Inside useCallback the body
  // only runs on tap.
  const onceGuard = useCallback((fn: () => void) => {
    const now = Date.now();
    if (now - lastTap.current < 400) return;
    lastTap.current = now;
    fn();
  }, []);

  if (suggestions.length === 0) return null;

  return (
    <section aria-labelledby="combos-title" className="flex flex-col gap-3">
      <h2
        id="combos-title"
        className="flex items-center gap-2 px-4 font-display text-title-sm font-bold text-foreground"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-honey text-honey-foreground">
          <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
        </span>
        Combos del día
      </h2>

      <div className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1">
        {suggestions.map((s, i) =>
          s.type === "combo" ? (
            <button
              key={`combo-${s.dish.id}-${s.drink.id}`}
              type="button"
              onClick={() => onceGuard(() => onAddCombo(s.dish, s.drink))}
              aria-label={`Agregar combo ${s.dish.name} más ${s.drink.name}, ${formatPrice(s.comboPrice)}`}
              className={`${cardClass} w-[200px]`}
            >
              <span className="flex flex-col gap-1">
                <span className="font-display text-body font-bold leading-snug text-foreground">
                  {s.dish.name}
                </span>
                <span className="flex items-center gap-1 text-meta leading-snug text-muted-foreground">
                  <Plus aria-hidden className="size-3 shrink-0 text-primary" strokeWidth={3} />
                  {s.drink.name}
                </span>
              </span>

              <span className="flex items-end justify-between gap-2 border-t border-border pt-2.5">
                <span className="flex flex-col leading-none">
                  <span className="text-caption font-medium text-muted-foreground">Los dos</span>
                  <span className="font-display mt-1 text-title font-bold tabular-nums text-wine">
                    {formatPrice(s.comboPrice)}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="clay clay-primary flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Plus className="size-5" strokeWidth={2.5} />
                </span>
              </span>
            </button>
          ) : (
            <button
              key={s.product.id ?? i}
              type="button"
              onClick={() => onceGuard(() => onSelectProduct(s.product))}
              className={`${cardClass} w-[160px]`}
            >
              <span className="font-display text-body font-bold leading-snug text-foreground">
                {s.product.name}
              </span>
              <span className="flex items-end justify-between gap-2 border-t border-border pt-2.5">
                <span className="font-display text-title font-bold tabular-nums text-wine">
                  {formatPrice(s.product.price)}
                </span>
                <span
                  aria-hidden
                  className="clay clay-primary flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Plus className="size-5" strokeWidth={2.5} />
                </span>
              </span>
            </button>
          )
        )}
      </div>
    </section>
  );
}
