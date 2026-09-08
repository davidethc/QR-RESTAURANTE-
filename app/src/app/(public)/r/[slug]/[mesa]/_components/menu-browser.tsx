"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Search, ShoppingBag, MessageCircle, Info } from "lucide-react";
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
import { buildWhatsappUrl } from "@/lib/whatsapp";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, cn, normalizeText } from "@/lib/utils";
import type { PublicCategory, PublicProduct } from "@/types/menu";

export function MenuBrowser({
  categories,
  slug,
  tableNumber,
  restaurantName,
  whatsappPhone,
}: {
  categories: PublicCategory[];
  slug: string;
  /** null = modo carta: sin mesa, el pedido se envía por WhatsApp. */
  tableNumber: number | null;
  restaurantName: string;
  whatsappPhone: string | null;
}) {
  const inTable = tableNumber !== null;
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
    // pb generoso: la barra inferior es fija y, con el botón "Ver
    // pedido" visible, ocupa ~9rem. Sin este colchón el último plato
    // queda tapado y el cliente no puede tocarlo.
    <div className="flex flex-col gap-7 pb-40">
      {/* Superficie glass 1 de 2 en toda la app. */}
      <div className="glass sticky top-0 z-10 flex flex-col gap-3 border-b border-border/50 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la carta…"
            className="neu-inset h-11 rounded-full border-transparent bg-secondary/80 pl-10 text-[15px] placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
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
                    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary-soft text-primary-soft-foreground active:bg-muted"
                  )}
                >
                  <span aria-hidden className="emoji-3d text-[15px] leading-none">
                    {getCategoryIcon(category.name)}
                  </span>
                  {category.name}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {!inTable && (
        <div className="px-4">
          <div className="flex items-start gap-2.5 rounded-2xl border border-primary/25 bg-primary/8 px-3.5 py-3">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              strokeWidth={2.25}
            />
            <p className="text-[13px] leading-snug text-foreground">
              Estás viendo la carta.{" "}
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
            cart.addItems([
              { product: dish, quantity: 1, notes: "" },
              { product: drink, quantity: 1, notes: "" },
            ]);
            notify.itemAdded(`${dish.name} + ${drink.name}`);
          }}
        />
      )}

      <div className="flex flex-col border-b border-border">
        {results === null ? (
          categories.map((category, i) => (
            <CategorySection
              key={category.id}
              category={category}
              index={i}
              isOpen={openCategories.has(category.id)}
              onToggle={() => toggleCategory(category.id)}
              onSelectProduct={setSelectedProduct}
              cartQuantities={cartQuantities}
              sectionRef={sectionRefCallbacks[category.id]}
            />
          ))
        ) : results.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No encontramos productos con &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="flex flex-col gap-2 px-4">
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
        restaurantName={restaurantName}
        whatsappPhone={whatsappPhone}
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
              <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                {cart.itemCount}
              </span>
            </span>
            <span className="font-display text-[20px] font-bold tabular-nums">
              {formatPrice(cart.total)}
            </span>
          </Button>
        )}
        {/* Llamar mesero / Pedir cuenta solo tienen sentido sentado en
            una mesa. Desde casa, la vía de contacto es WhatsApp y vive
            dentro del carrito. */}
        {tableNumber !== null ? (
          <ServiceButtons tableNumber={tableNumber} />
        ) : (
          whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-semibold text-foreground active:bg-muted"
            >
              <MessageCircle className="h-4 w-4 text-primary" strokeWidth={2.25} />
              Hablar por WhatsApp
            </a>
          )
        )}
      </div>
    </div>
  );
}
