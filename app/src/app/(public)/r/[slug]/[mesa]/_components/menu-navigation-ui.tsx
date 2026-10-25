"use client";

import type { CSSProperties, ReactNode } from "react";
import { ArrowUp, ChevronsUp, Search, SearchX, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { CategorySection } from "./category-section";
import { ProductCard, type ProductPromo } from "./product-card";
import type { MenuNavigation } from "./use-menu-navigation";
import type { MenuSearchResult } from "./use-menu-search";
import type { PublicCategory, PublicProduct } from "@/types/menu";

/**
 * Pieces of the customer menu shared by the QR menu (`/r`) and the digital
 * menu (`/pedir`), so both behave and look the same and the chips/accordion
 * logic lives in one place (`useMenuNavigation`).
 */

const pressable =
  "touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Root wrapper: publishes the sticky bar height for the sticky section headers. */
export function MenuNavRoot({ nav, className, children }: { nav: MenuNavigation; className?: string; children: ReactNode }) {
  return (
    <div className={className} style={{ "--menu-bar-h": `${nav.barHeight}px` } as CSSProperties}>
      {children}
    </div>
  );
}

/**
 * Sticky search + category chips.
 *
 * The chips have no color transition and no tap highlight: inside a
 * `backdrop-filter` bar during a smooth scroll, iOS Safari repaints the
 * whole layer each frame and an animated color there flickered. The active
 * chip changes instantly, and softly: a light tint with primary text and a
 * thin ring, so the section on screen reads at a glance without a block of
 * solid color following the scroll.
 *
 * The search keeps its full height while scrolling: a compact state would
 * resize the sticky bar mid-scroll and move every sticky header with it.
 */
export function MenuToolbar({
  nav,
  categories,
  query,
  onQueryChange,
  placeholder,
  searchLabel,
}: {
  nav: MenuNavigation;
  categories: PublicCategory[];
  query: string;
  onQueryChange: (q: string) => void;
  placeholder: string;
  searchLabel: string;
}) {
  const { state, goTo, attachBar, attachChipStrip, attachChip } = nav;
  const searching = query.trim().length > 0;

  return (
    <div ref={attachBar} className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 pb-2.5 pt-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-primary"
          />
          <Input
            enterKeyHint="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            aria-label={searchLabel}
            className="neu-inset h-12 rounded-xl border-border bg-card pl-11 pr-11 text-body-lg placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Borrar búsqueda"
              className={cn(
                "absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary",
                pressable
              )}
            >
              <X aria-hidden className="size-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {!searching && categories.length > 1 && (
          <div className="-mx-4 flex items-center gap-2">
            <nav
              ref={attachChipStrip}
              aria-label="Categorías"
              className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-px-4 px-4"
            >
              {categories.map((category) => {
                const isActive = state.active === category.id;
                return (
                  <button
                    key={category.id}
                    ref={attachChip}
                    data-chip-id={category.id}
                    type="button"
                    onClick={() => goTo(category.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex h-11 shrink-0 items-center gap-2 rounded-full border pl-3 pr-2 text-body-sm font-semibold",
                      pressable,
                      isActive
                        ? "border-primary/35 bg-primary-soft text-primary-soft-foreground ring-1 ring-primary/20"
                        : "border-border bg-card text-foreground hover:border-primary/40 active:bg-secondary"
                    )}
                  >
                    <span aria-hidden className="text-body-lg leading-none">
                      {getCategoryIcon(category.name)}
                    </span>
                    {category.name}
                    <span
                      className={cn(
                        "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
                        isActive ? "bg-primary/15 text-primary-soft-foreground" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {category.products.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

/** Every category as a collapsible section. */
export function MenuSectionList({
  nav,
  title,
  categories,
  onSelectProduct,
  cartQuantities,
  promos,
}: {
  nav: MenuNavigation;
  title: string;
  categories: PublicCategory[];
  onSelectProduct: (product: PublicProduct) => void;
  cartQuantities: Record<string, number>;
  promos?: Record<string, ProductPromo>;
}) {
  return (
    <section aria-labelledby="menu-list-title" className="flex flex-col gap-3 px-4">
      <h2 id="menu-list-title" className="font-display text-title-sm font-bold text-foreground">
        {title}
      </h2>
      {categories.map((category) => (
        <CategorySection
          key={category.id}
          category={category}
          isOpen={nav.state.open.includes(category.id)}
          onToggle={nav.toggle}
          onCollapse={nav.collapse}
          sectionRef={nav.attachSection}
          onSelectProduct={onSelectProduct}
          cartQuantities={cartQuantities}
          promos={promos}
        />
      ))}
    </section>
  );
}

/** Search results, or the empty state with a way back to the menu. */
export function MenuSearchResults({
  query,
  results,
  onClear,
  onSelectProduct,
  cartQuantities,
  promos,
  emptyAction,
}: {
  query: string;
  results: readonly MenuSearchResult[];
  onClear: () => void;
  onSelectProduct: (product: PublicProduct) => void;
  cartQuantities: Record<string, number>;
  promos?: Record<string, ProductPromo>;
  emptyAction: string;
}) {
  if (results.length === 0) {
    return (
      <div className="px-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <SearchX aria-hidden className="size-6" />
          </span>
          <p className="text-body font-semibold text-foreground">No encontramos &ldquo;{query}&rdquo;</p>
          <p className="text-body-sm text-muted-foreground">Prueba con otra palabra o mira todo.</p>
          <Button type="button" variant="outline" onClick={onClear} className="mt-1 h-11 rounded-xl px-5 text-body">
            {emptyAction}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 px-4">
      {/* Results have no category heading; without this the restaurant h1
          jumps straight to each dish's h3. */}
      <h2 className="text-body-sm font-semibold text-muted-foreground" aria-live="polite">
        {results.length} {results.length === 1 ? "resultado" : "resultados"}
      </h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {results.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            categoryName={product.categoryName}
            promo={promos?.[product.id]}
            onSelect={onSelectProduct}
            quantityInCart={cartQuantities[product.id] ?? 0}
          />
        ))}
      </div>
    </section>
  );
}

const floatingButton =
  "flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground shadow-md transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity";

/**
 * "Contraer todo" and "Arriba" float right above the fixed action bar, so
 * they never cover the category chips or the cart button whatever the bar
 * height is. Each one only shows while it has something to do.
 */
export function MenuFloatingActions({ nav }: { nav: MenuNavigation }) {
  const canCollapseAll = nav.state.open.length > 1;
  return (
    <div className="pointer-events-none absolute bottom-full right-4 mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={nav.collapseAll}
        tabIndex={canCollapseAll ? 0 : -1}
        aria-hidden={!canCollapseAll}
        className={cn(
          floatingButton,
          pressable,
          canCollapseAll ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        <ChevronsUp aria-hidden className="size-4" strokeWidth={2.5} />
        Contraer todo
      </button>
      <button
        type="button"
        onClick={nav.scrollToTop}
        aria-label="Volver arriba"
        tabIndex={nav.showTop ? 0 : -1}
        aria-hidden={!nav.showTop}
        className={cn(
          floatingButton,
          pressable,
          nav.showTop ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        <ArrowUp aria-hidden className="size-4" strokeWidth={2.5} />
        Arriba
      </button>
    </div>
  );
}
