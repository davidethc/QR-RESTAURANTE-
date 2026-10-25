"use client";

import { memo, useCallback, useRef } from "react";
import Image from "next/image";
import { Sparkles, Plus } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { MenuSuggestion } from "@/lib/suggestions";
import type { PublicProduct } from "@/types/menu";

const cardClass =
  "group flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card text-left touch-manipulation [-webkit-tap-highlight-color:transparent] transition-transform duration-150 ease-out hover:border-primary/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:active:scale-100";

/** Cards on screen at first paint: their photos load eagerly, the rest lazily. */
const EAGER_CARDS = 2;

/** Fixed photo box: the carousel never shifts while photos load. */
function Photo({ src, sizes, fallback, eager }: { src: string | null; sizes: string; fallback: string; eager: boolean }) {
  return (
    <span className="relative block h-full w-full bg-secondary">
      {src ? (
        <Image src={src} alt="" fill sizes={sizes} loading={eager ? "eager" : "lazy"} className="object-cover" />
      ) : (
        <span aria-hidden className="emoji-tile flex size-full items-center justify-center text-[2rem] leading-none">
          <span className="emoji-3d">{fallback}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Featured dishes or combos, right under the search, before the customer
 * picks a category. Never empty (see lib/suggestions.ts). When the menu has
 * photos the cards lead with them; a combo shows dish and drink side by
 * side. Without any photo the cards stay typographic. Memoized: the search
 * box and the scroll-spy re-render the menu, never these cards.
 */
export const SuggestionsRow = memo(function SuggestionsRow({
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

  const hasPhotos = suggestions.some((s) =>
    s.type === "combo" ? Boolean(s.dish.image_url || s.drink.image_url) : Boolean(s.product.image_url)
  );
  const allCombos = suggestions.every((s) => s.type === "combo");

  return (
    <section aria-labelledby="combos-title" className="flex flex-col gap-3">
      <h2 id="combos-title" className="flex items-center gap-2 px-4 font-display text-title-sm font-bold text-foreground">
        <span className="flex size-7 items-center justify-center rounded-lg bg-honey text-honey-foreground">
          <Sparkles aria-hidden className="size-4" strokeWidth={2.5} />
        </span>
        {allCombos ? "Combos del día" : "Destacados"}
      </h2>

      <div className="no-scrollbar flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1">
        {suggestions.map((s, i) =>
          s.type === "combo" ? (
            <button
              key={`combo-${s.dish.id}-${s.drink.id}`}
              type="button"
              onClick={() => onceGuard(() => onAddCombo(s.dish, s.drink))}
              aria-label={`Agregar combo ${s.dish.name} más ${s.drink.name}, ${formatPrice(s.comboPrice)}`}
              className={`${cardClass} w-[208px]`}
            >
              {hasPhotos && (
                <span aria-hidden className="grid h-[104px] grid-cols-2 gap-px bg-border">
                  <Photo src={s.dish.image_url} sizes="104px" fallback="🍽️" eager={i < EAGER_CARDS} />
                  <Photo src={s.drink.image_url} sizes="104px" fallback="🥤" eager={i < EAGER_CARDS} />
                </span>
              )}
              <span className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                <span className="flex flex-col gap-1">
                  <span className="font-display line-clamp-2 text-body font-bold leading-snug text-foreground">{s.dish.name}</span>
                  <span className="flex items-center gap-1 text-meta leading-snug text-muted-foreground">
                    <Plus aria-hidden className="size-3 shrink-0 text-primary" strokeWidth={3} />
                    <span className="truncate">{s.drink.name}</span>
                  </span>
                </span>
                <span className="flex items-end justify-between gap-2">
                  <span className="flex flex-col leading-none">
                    <span className="text-caption font-medium text-muted-foreground">Los dos</span>
                    <span className="font-display mt-1 text-title font-bold tabular-nums text-wine">{formatPrice(s.comboPrice)}</span>
                  </span>
                  <span
                    aria-hidden
                    className="clay clay-primary flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Plus className="size-5" strokeWidth={2.75} />
                  </span>
                </span>
              </span>
            </button>
          ) : (
            <button
              key={s.product.id}
              type="button"
              onClick={() => onceGuard(() => onSelectProduct(s.product))}
              className={`${cardClass} w-[168px]`}
            >
              {hasPhotos && (
                <span aria-hidden className="block h-[120px]">
                  <Photo src={s.product.image_url} sizes="168px" fallback="🍽️" eager={i < EAGER_CARDS} />
                </span>
              )}
              <span className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                <span className="font-display line-clamp-2 text-body font-bold leading-snug text-foreground">{s.product.name}</span>
                <span className="flex items-end justify-between gap-2">
                  <span className="font-display text-title font-bold tabular-nums text-wine">{formatPrice(s.product.price)}</span>
                  <span
                    aria-hidden
                    className="clay clay-primary flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Plus className="size-5" strokeWidth={2.75} />
                  </span>
                </span>
              </span>
            </button>
          )
        )}
      </div>
    </section>
  );
});
