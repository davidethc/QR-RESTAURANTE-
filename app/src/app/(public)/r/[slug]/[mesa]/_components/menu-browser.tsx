"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ShoppingBag, QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import { CategorySection } from "./category-section";
import { SuggestionsRow } from "./suggestions-row";
import { ProductSheet } from "./product-sheet";
import { CartSheet } from "./cart-sheet";
import { ServiceButtons } from "./service-buttons";
import { useCart } from "@/hooks/use-cart";
import { notify } from "@/lib/notifications";
import { getMenuSuggestions, flattenSuggestions } from "@/lib/suggestions";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, cn } from "@/lib/utils";
import type { PublicCategory, PublicProduct } from "@/types/menu";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function MenuBrowser({
  categories,
  slug,
  tableNumber,
}: {
  categories: PublicCategory[];
  slug: string;
  tableNumber: number;
}) {
  const [query, setQuery] = useState("");
  // Todas las categorías arrancan cerradas — el cliente ve la lista
  // completa de nombres de un vistazo y toca la que le interesa, en
  // vez de recibir un scroll larguísimo con los 50 productos abiertos
  // de una vez apenas escanea el QR.
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set()
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(
    null
  );
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart(slug, tableNumber);

  // Pill activa = categoría que el cliente está mirando. Un solo
  // IntersectionObserver para todas las secciones (no un listener de
  // scroll, que dispararía en cada píxel y costaría rendimiento).
  // Arranca en la primera categoría para que la fila de pills nunca se
  // vea "sin nada seleccionado" al entrar.
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  );

  useEffect(() => {
    const sections = Object.values(sectionRefs.current).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          setActiveCategoryId(visible.target.id.replace("cat-", ""));
        }
      },
      { rootMargin: "-140px 0px -55% 0px" }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart.items) {
      map[item.product.id] = (map[item.product.id] ?? 0) + item.quantity;
    }
    return map;
  }, [cart.items]);

  // "Sugerencias para ti" nunca se ve vacío: si el restaurante no
  // marcó nada como Destacado, se arman combos plato+bebida ordenados
  // de más barato a más caro — ver lib/suggestions.ts.
  const suggestions = useMemo(() => getMenuSuggestions(categories), [categories]);
  const suggestedProducts = useMemo(
    () => flattenSuggestions(suggestions),
    [suggestions]
  );

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;

    return categories.flatMap((category) =>
      category.products
        .filter((product) => normalize(product.name).includes(q))
        .map((product) => ({ ...product, categoryName: category.name }))
    );
  }, [categories, query]);

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function goToCategory(id: string) {
    setOpenCategories((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    // pb generoso: la barra inferior es fija y, con el botón "Ver
    // pedido" visible, ocupa ~9rem. Sin este colchón el último plato
    // queda tapado y el cliente no puede tocarlo.
    <div className="flex flex-col gap-5 pb-40">
      {/* Superficie glass 1 de 2 en toda la app. */}
      <div className="glass sticky top-0 z-10 flex flex-col gap-3 border-b border-border/50 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la carta…"
            className="neu-inset h-11 rounded-full border-transparent bg-secondary/80 pl-10 text-[15px] placeholder:text-muted-foreground/70 focus-visible:border-primary/30"
          />
        </div>

        {results === null && (
          <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {categories.map((category) => {
              const isActive = activeCategoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => goToCategory(category.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200",
                    isActive
                      ? "clay clay-primary bg-primary text-primary-foreground"
                      : "border border-border/70 bg-card text-secondary-foreground active:bg-secondary"
                  )}
                >
                  <span aria-hidden className="text-sm leading-none">
                    {getCategoryIcon(category.name)}
                  </span>
                  {category.name}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {results === null && (
        <SuggestionsRow
          suggestions={suggestions}
          onSelectProduct={setSelectedProduct}
          onAddCombo={(dish, drink) => {
            cart.addItems([
              { product: dish, quantity: 1, notes: "" },
              { product: drink, quantity: 1, notes: "" },
            ]);
            notify.itemAdded(`${dish.name} + ${drink.name}`);
          }}
        />
      )}

      {results === null && (
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/70 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <QrCode className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-display text-[14px] font-semibold leading-tight text-foreground">
                Pide fácil, rápido y sin esperas
              </span>
              <span className="text-[12px] leading-snug text-muted-foreground">
                Elige tus platos y nosotros nos encargamos del resto.
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {results === null ? (
          categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              isOpen={openCategories.has(category.id)}
              onToggle={() => toggleCategory(category.id)}
              onSelectProduct={setSelectedProduct}
              cartQuantities={cartQuantities}
              sectionRef={(el) => {
                sectionRefs.current[category.id] = el;
              }}
            />
          ))
        ) : results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No encontramos productos con &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="flex flex-col gap-2 px-4">
            {results.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={setSelectedProduct}
                quantityInCart={cartQuantities[product.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      <ProductSheet
        product={selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        onAdd={(product, quantity, notes) => {
          cart.addItem(product, quantity, notes);
          notify.itemAdded(product.name);
        }}
      />

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={cart.items}
        total={cart.total}
        onUpdateQuantity={cart.updateQuantity}
        onRemove={cart.removeItem}
        onClearCart={cart.clearCart}
        slug={slug}
        tableNumber={tableNumber}
        suggestedProducts={suggestedProducts}
        onAddSuggestion={(product) => {
          cart.addItem(product, 1, "");
          notify.itemAdded(product.name);
        }}
      />

      {/* Barra de acciones tipo app nativa: elevada sobre el contenido
          con sombra propia (no un simple borde) y con respeto por el
          área segura del iPhone, para que el botón no quede debajo de
          la barra de gestos. */}
      <div
        className="glass fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-border/50 px-4 pt-3"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -8px 24px -12px oklch(0.4 0.03 50 / 0.25)",
        }}
      >
        {cart.itemCount > 0 && (
          <Button
            size="lg"
            className="clay clay-primary h-12 w-full justify-between rounded-2xl text-[15px]"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Ver pedido
              <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                {cart.itemCount}
              </span>
            </span>
            <span className="font-display text-base font-semibold tabular-nums">
              {formatPrice(cart.total)}
            </span>
          </Button>
        )}
        <ServiceButtons tableNumber={tableNumber} />
      </div>
    </div>
  );
}
