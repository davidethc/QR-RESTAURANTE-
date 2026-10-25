"use client";

import { useCallback, useMemo, useState } from "react";
import { ShoppingBag, MessageCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuggestionsRow } from "./suggestions-row";
import { useMenuNavigation } from "./use-menu-navigation";
import { useCartQuantities, useMenuSearch } from "./use-menu-search";
import {
  MenuFloatingActions,
  MenuNavRoot,
  MenuSearchResults,
  MenuSectionList,
  MenuToolbar,
} from "./menu-navigation-ui";
import { ProductSheet } from "./product-sheet";
import { CartSheet } from "./cart-sheet";
import { ServiceButtons } from "./service-buttons";
import { useTableStatus } from "./table-status-provider";
import { useLiveMenuCategories } from "@/hooks/use-live-menu";
import { useCart } from "@/hooks/use-cart";
import { notify } from "@/lib/notifications";
import { getMenuSuggestions, flattenSuggestions } from "@/lib/suggestions";
import { buildWhatsappUrl } from "@/lib/whatsapp";
import { formatPrice } from "@/lib/utils";
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
  // Open sections, active chip, scroll-spy and every automatic scroll:
  // shared with the digital menu (/pedir). See use-menu-navigation.ts.
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const nav = useMenuNavigation(categoryIds);

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

  const cartQuantities = useCartQuantities(cart.items);

  // "Sugerencias para ti" nunca se ve vacío: si el restaurante no
  // marcó nada como Destacado, se arman combos plato+bebida ordenados
  // de más barato a más caro — ver lib/suggestions.ts.
  const suggestions = useMemo(() => getMenuSuggestions(categories), [categories]);
  const suggestedProducts = useMemo(
    () => flattenSuggestions(suggestions),
    [suggestions]
  );

  const results = useMenuSearch(categories, query);

  // Stable, so the memoized suggestions row does not re-render per keystroke.
  const { addItems } = cart;
  const addCombo = useCallback(
    (dish: PublicProduct, drink: PublicProduct) => {
      // If anything in the combo needs a variant/extras, open its sheet.
      const pick = [dish, drink].find((p) => needsChoice(productDetails[p.id]));
      if (pick) {
        setSelectedProduct(pick);
        return;
      }
      addItems([
        { product: dish, quantity: 1, notes: "" },
        { product: drink, quantity: 1, notes: "" },
      ]);
      notify.itemAdded(`${dish.name} + ${drink.name}`);
    },
    [productDetails, addItems]
  );

  return (
    // Generous bottom padding: the fixed action bar is ~9rem tall with
    // "Ver pedido" visible. Without it the last dish is hidden under it.
    <MenuNavRoot nav={nav} className="flex flex-col gap-6 pb-44">
      <MenuToolbar
        nav={nav}
        categories={categories}
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar un plato o bebida"
        searchLabel="Buscar en la carta"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {!inTable && (
          <div className="px-4">
            <div
              role="note"
              className="flex items-start gap-3 rounded-2xl border border-honey/40 bg-honey-soft px-4 py-3"
            >
              <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-honey-soft-foreground" strokeWidth={2.25} />
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
          <SuggestionsRow suggestions={suggestions} onSelectProduct={setSelectedProduct} onAddCombo={addCombo} />
        )}

        {results === null ? (
          <MenuSectionList
            nav={nav}
            title="La carta"
            categories={categories}
            onSelectProduct={setSelectedProduct}
            cartQuantities={cartQuantities}
          />
        ) : (
          <MenuSearchResults
            query={query}
            results={results}
            onClear={() => setQuery("")}
            onSelectProduct={setSelectedProduct}
            cartQuantities={cartQuantities}
            emptyAction="Ver toda la carta"
          />
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
        <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-3">
          <MenuFloatingActions nav={nav} />
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
    </MenuNavRoot>
  );
}
