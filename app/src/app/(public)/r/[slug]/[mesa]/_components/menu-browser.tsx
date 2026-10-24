"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Search, SearchX, ShoppingBag, MessageCircle, Info, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import { CategorySection } from "./category-section";
import { SuggestionsRow } from "./suggestions-row";
import { ProductSheet } from "./product-sheet";
import { CartSheet } from "./cart-sheet";
import { ServiceButtons } from "./service-buttons";
import { useTableStatus } from "./table-status-provider";
import { useLiveMenuCategories } from "@/hooks/use-live-menu";
import { useCart } from "@/hooks/use-cart";
import { notify } from "@/lib/notifications";
import { getMenuSuggestions, flattenSuggestions } from "@/lib/suggestions";
import { buildWhatsappUrl } from "@/lib/whatsapp";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, cn, normalizeText } from "@/lib/utils";
import { needsChoice } from "@/lib/order-lines";
import type { PublicCategory, PublicProduct, StaffProductDetail } from "@/types/menu";

export function MenuBrowser({
  categories: initialCategories,
  productDetails,
  slug,
  tableNumber,
  restaurantName,
  whatsappPhone,
}: {
  categories: PublicCategory[];
  /** Variantes y extras por producto (id). */
  productDetails: Record<string, StaffProductDetail>;
  slug: string;
  /** null = modo carta: sin mesa, el pedido se envía por WhatsApp. */
  tableNumber: number | null;
  restaurantName: string;
  whatsappPhone: string | null;
}) {
  const inTable = tableNumber !== null;
  // M09: la disponibilidad se actualiza sola mientras la carta está abierta.
  const categories = useLiveMenuCategories(slug, initialCategories);
  const [query, setQuery] = useState("");
  // Todas las categorías arrancan cerradas — el cliente ve la lista
  // completa de nombres de un vistazo y toca la que le interesa, en
  // vez de recibir un scroll larguísimo con los 50 productos abiertos
  // de una vez apenas escanea el QR.
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set()
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  // Un callback de ref ESTABLE por categoría. Con una flecha creada en
  // el JSX, React ve una función distinta en cada render y desmonta y
  // vuelve a asignar todos los refs cada vez.
  //
  // Se arma con useMemo a partir de `categories` en vez de leer un ref
  // durante el render (que era lo que hacía el `getSectionRef` anterior,
  // y lo que React Compiler marca como error): escribir en
  // `sectionRefs.current` dentro del propio callback sí es válido,
  // porque React lo invoca al montar, no al renderizar.
  const sectionRefCallbacks = useMemo(() => {
    const map: Record<string, (el: HTMLElement | null) => void> = {};
    for (const category of categories) {
      map[category.id] = (el) => {
        sectionRefs.current[category.id] = el;
      };
    }
    return map;
  }, [categories]);

  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(
    null
  );
  const [cartOpen, setCartOpen] = useState(false);
  // Mesa 0 = carrito del modo carta. Las mesas reales empiezan en 1,
  // así que nunca se pisa con el carrito de una mesa de verdad.
  const cart = useCart(slug, tableNumber ?? 0);
  const { canOrder } = useTableStatus();

  // Enlace de "solo conversar", sin pedido: el que lleva el pedido
  // redactado vive en el carrito.
  const whatsappUrl = buildWhatsappUrl(
    whatsappPhone,
    `Hola ${restaurantName}, vi su carta y quisiera hacer una consulta.`
  );

  // Pill activa = la categoría que el cliente ABRIÓ, no la que le queda
  // debajo del dedo al hacer scroll.
  //
  // Antes esto lo decidía un IntersectionObserver, y estaba mal por dos
  // razones: durante el scroll suave que dispara el propio clic, el
  // observer se iba quedando con la sección que estuviera arriba en ese
  // instante, así que acababa pintando una pill distinta de la que se
  // tocó; y al entrar marcaba la primera categoría cuando en realidad
  // no había ninguna abierta. Marcar por scroll además es una promesa
  // que la pantalla no puede cumplir: con las categorías cerradas, casi
  // todas caen dentro del viewport a la vez.
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

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

  // Índice de búsqueda precalculado. Antes cada pulsación de tecla
  // normalizaba en Unicode los 50 nombres de la carta otra vez, en el
  // hilo principal de un celular de gama baja. Ahora se normaliza una
  // vez por carta y cada tecla solo hace un includes().
  const searchIndex = useMemo(
    () =>
      categories.flatMap((category) =>
        category.products.map((product) => ({
          product,
          categoryName: category.name,
          haystack: normalizeText(
            `${product.name} ${product.description ?? ""}`
          ),
        }))
      ),
    [categories]
  );

  // La lista de resultados puede quedarse un fotograma atrás de lo que
  // se está escribiendo: teclear siempre responde al instante.
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const q = normalizeText(deferredQuery.trim());
    if (!q) return null;

    return searchIndex
      .filter((entry) => entry.haystack.includes(q))
      .map((entry) => ({ ...entry.product, categoryName: entry.categoryName }));
  }, [searchIndex, deferredQuery]);

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
    // Abrir marca; cerrar solo apaga si era la marcada. Sin distinguir
    // los dos casos, cerrar una categoría cualquiera movía la marca a
    // esa misma categoría recién cerrada.
    const isOpening = !openCategories.has(id);
    setActiveCategoryId((prev) =>
      isOpening ? id : prev === id ? null : prev
    );
  }

  function goToCategory(id: string) {
    setOpenCategories((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setActiveCategoryId(id);
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    // Generous bottom padding: the fixed action bar is ~9rem tall with
    // "Ver pedido" visible. Without it the last dish is hidden under it.
    <div className="flex flex-col gap-6 pb-44">
      <div className="glass sticky top-0 z-10 border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar un plato o bebida"
              aria-label="Buscar en la carta"
              className="h-12 rounded-xl border-border bg-card pl-11 pr-11 text-body-lg placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
              >
                <X aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {results === null && (
            <nav
              aria-label="Categorías de la carta"
              className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
            >
              {categories.map((category) => {
                const isActive = activeCategoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => goToCategory(category.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:border-primary/40 active:bg-secondary"
                    )}
                  >
                    <span aria-hidden className="emoji-3d text-body-lg leading-none">
                      {getCategoryIcon(category.name)}
                    </span>
                    {category.name}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-caption font-semibold tabular-nums",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {category.products.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {!inTable && (
          <div className="px-4">
            <div
              role="note"
              className="flex items-start gap-3 rounded-2xl border border-info-border bg-info-soft px-4 py-3"
            >
              <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-info-soft-foreground" strokeWidth={2.25} />
              <p className="text-body-sm leading-snug text-foreground">
                <span className="font-semibold">Estás viendo la carta.</span>{" "}
                <span className="text-muted-foreground">
                  Arma tu pedido y lo envías por WhatsApp. Si estás en el local,
                  escanea el QR de tu mesa para pedir desde ahí.
                </span>
              </p>
            </div>
          </div>
        )}

        {results === null && (
          <SuggestionsRow
            suggestions={suggestions}
            onSelectProduct={setSelectedProduct}
            onAddCombo={(dish, drink) => {
              // If anything in the combo needs a variant/extras, open its sheet.
              const pick = [dish, drink].find((p) => needsChoice(productDetails[p.id]));
              if (pick) {
                setSelectedProduct(pick);
                return;
              }
              cart.addItems([
                { product: dish, quantity: 1, notes: "" },
                { product: drink, quantity: 1, notes: "" },
              ]);
              notify.itemAdded(`${dish.name} + ${drink.name}`);
            }}
          />
        )}

        {results === null ? (
          <div className="flex flex-col gap-3 px-4">
            <h2 className="font-display text-title-sm font-bold text-foreground">
              La carta
            </h2>
            {categories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                isOpen={openCategories.has(category.id)}
                onToggle={() => toggleCategory(category.id)}
                onSelectProduct={setSelectedProduct}
                cartQuantities={cartQuantities}
                sectionRef={sectionRefCallbacks[category.id]}
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="px-4">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <SearchX aria-hidden className="size-6" />
              </span>
              <p className="text-body font-semibold text-foreground">
                No encontramos &ldquo;{query}&rdquo;
              </p>
              <p className="text-body-sm text-muted-foreground">
                Prueba con otra palabra o mira la carta completa.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuery("")}
                className="mt-1 h-11 rounded-xl px-5 text-body"
              >
                Ver toda la carta
              </Button>
            </div>
          </div>
        ) : (
          <section className="flex flex-col gap-3 px-4">
            {/* Search results have no visible category heading; without
                this the restaurant h1 jumps straight to each dish's h3. */}
            <h2 className="text-body-sm font-semibold text-muted-foreground">
              {results.length} {results.length === 1 ? "resultado" : "resultados"}
            </h2>
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {results.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryName={product.categoryName}
                  onSelect={setSelectedProduct}
                  quantityInCart={cartQuantities[product.id] ?? 0}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <ProductSheet
        product={selectedProduct}
        detail={selectedProduct ? productDetails[selectedProduct.id] : undefined}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        onAdd={(product, quantity, notes, choice) => {
          cart.addItem(product, quantity, notes, choice);
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
        orderingClosed={!canOrder}
        restaurantName={restaurantName}
        whatsappPhone={whatsappPhone}
        suggestedProducts={suggestedProducts}
        onAddSuggestion={(product) => {
          if (needsChoice(productDetails[product.id])) {
            setCartOpen(false);
            setSelectedProduct(product);
            return;
          }
          cart.addItem(product, 1, "");
          notify.itemAdded(product.name);
        }}
      />

      {/* Native-app action bar: lifted over the content with its own
          shadow and respecting the iPhone safe area, so the button never
          sits under the gesture bar. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur-md"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -10px 28px -16px rgb(15 23 42 / 0.28)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-3">
          {cart.itemCount > 0 && (
            <Button
              size="lg"
              className="clay clay-primary h-14 w-full justify-between rounded-2xl px-4 text-body-lg font-semibold"
              onClick={() => setCartOpen(true)}
              aria-label={`Ver pedido con ${cart.itemCount} artículos, total ${formatPrice(cart.total)}`}
            >
              <span className="flex items-center gap-2.5">
                <span className="relative flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15">
                  <ShoppingBag aria-hidden className="size-5" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-honey px-1 text-caption font-bold tabular-nums text-honey-foreground">
                    {cart.itemCount}
                  </span>
                </span>
                Ver mi pedido
              </span>
              <span className="font-display text-title font-bold tabular-nums">
                {formatPrice(cart.total)}
              </span>
            </Button>
          )}
          {/* Call waiter / ask for the bill only make sense at a table.
              From home, the contact channel is WhatsApp. */}
          {tableNumber !== null ? (
            <ServiceButtons tableNumber={tableNumber} />
          ) : (
            whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-body font-semibold text-foreground transition-colors duration-150 hover:bg-secondary active:bg-secondary"
              >
                <MessageCircle aria-hidden className="size-5 text-primary" strokeWidth={2.25} />
                Hablar por WhatsApp
              </a>
            )
          )}
        </div>
      </div>
    </div>
  );
}
