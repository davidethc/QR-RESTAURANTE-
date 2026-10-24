"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Bike, Clock, MapPin, ShoppingBag, Store, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductSheet } from "@/app/(public)/r/[slug]/[mesa]/_components/product-sheet";
import { SuggestionsRow } from "@/app/(public)/r/[slug]/[mesa]/_components/suggestions-row";
import { useMenuNavigation } from "@/app/(public)/r/[slug]/[mesa]/_components/use-menu-navigation";
import {
  BackToTopButton,
  MenuNavRoot,
  MenuSearchResults,
  MenuSectionList,
  MenuToolbar,
} from "@/app/(public)/r/[slug]/[mesa]/_components/menu-navigation-ui";
import { useLiveMenuCategories } from "@/hooks/use-live-menu";
import { useCart } from "@/hooks/use-cart";
import { notify } from "@/lib/notifications";
import { productPromos } from "@/lib/menu-navigation";
import { getMenuSuggestions } from "@/lib/suggestions";
import { needsChoice } from "@/lib/order-lines";
import { SERVICE_LABELS } from "@/lib/digital-menu";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import type { PublicCategory, PublicProduct, StaffProductDetail } from "@/types/menu";
import type { DigitalMenu, OnlineServiceType } from "@/types/digital-menu";
import { MenuStateNotice } from "./menu-state-notice";
import { OrderSheet } from "./order-sheet";

/** Cart slot for the delivery/pickup menu. Real tables start at 1 and the QR "carta" uses 0. */
const ONLINE_CART_SLOT = -1;

function modeKey(slug: string) {
  return `mk_online_mode_${slug}`;
}

export function DigitalMenuApp({
  slug,
  digital,
  categories: initialCategories,
  productDetails,
  restaurantAddress,
}: {
  slug: string;
  digital: DigitalMenu;
  categories: PublicCategory[];
  productDetails: Record<string, StaffProductDetail>;
  restaurantAddress: string | null;
}) {
  const categories = useLiveMenuCategories(slug, initialCategories);
  const cart = useCart(slug, ONLINE_CART_SLOT);
  const accepting = digital.state.accepting_orders;
  const delivery = digital.delivery;

  const [mode, setMode] = useState<OnlineServiceType>("delivery");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(modeKey(slug));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with localStorage (client only)
      if (saved === "delivery" || saved === "pickup") setMode(saved);
    } catch {
      // Private mode: keep the default.
    }
  }, [slug]);
  function chooseMode(next: OnlineServiceType) {
    setMode(next);
    try {
      window.localStorage.setItem(modeKey(slug), next);
    } catch {
      // Not persisted; still works for this visit.
    }
  }

  const hidden = useMemo(() => new Set(digital.hidden_product_ids?.[mode] ?? []), [digital.hidden_product_ids, mode]);
  const visibleCategories = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, products: c.products.filter((p) => !hidden.has(p.id)) }))
        .filter((c) => c.products.length > 0),
    [categories, hidden]
  );

  const promotions = useMemo(
    () => (digital.promotions ?? []).filter((p) => p.channels[mode]),
    [digital.promotions, mode]
  );

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  // Same navigation as the QR menu: see use-menu-navigation.ts.
  const categoryIds = useMemo(() => visibleCategories.map((c) => c.id), [visibleCategories]);
  const nav = useMenuNavigation(categoryIds);
  const promos = useMemo(() => productPromos(visibleCategories, promotions), [visibleCategories, promotions]);
  const suggestions = useMemo(() => getMenuSuggestions(visibleCategories), [visibleCategories]);

  const [selected, setSelected] = useState<PublicProduct | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart.items) map[item.product.id] = (map[item.product.id] ?? 0) + item.quantity;
    return map;
  }, [cart.items]);

  const results = useMemo(() => {
    const q = normalizeText(deferredQuery.trim());
    if (!q) return null;
    return visibleCategories.flatMap((c) =>
      c.products
        .filter((p) => normalizeText(`${p.name} ${p.description ?? ""}`).includes(q))
        .map((p) => ({ ...p, categoryName: c.name }))
    );
  }, [visibleCategories, deferredQuery]);

  function selectProduct(product: PublicProduct) {
    if (!accepting) {
      notify.success("Por ahora solo puedes ver el menú");
      return;
    }
    setSelected(product);
  }

  function addCombo(dish: PublicProduct, drink: PublicProduct) {
    if (!accepting) {
      notify.success("Por ahora solo puedes ver el menú");
      return;
    }
    const pick = [dish, drink].find((p) => needsChoice(productDetails[p.id]));
    if (pick) {
      setSelected(pick);
      return;
    }
    cart.addItems([
      { product: dish, quantity: 1, notes: "" },
      { product: drink, quantity: 1, notes: "" },
    ]);
    notify.itemAdded(`${dish.name} + ${drink.name}`);
  }

  const freeFrom = delivery?.free_shipping_enabled ? delivery.free_shipping_min_amount : null;
  const minPurchase = delivery?.min_purchase_enabled ? delivery.min_purchase_amount : null;

  return (
    <MenuNavRoot nav={nav} className="flex flex-col gap-5 pb-36">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4">
        {!accepting && <MenuStateNotice state={digital.state} timeZone={digital.restaurant.timezone} />}

        {/* Mode: the first decision, so it lives above the menu in its own card. */}
        <section aria-label="Cómo quieres tu pedido" className="overflow-hidden rounded-2xl border border-border bg-card">
          <div role="radiogroup" aria-label="Tipo de pedido" className="grid grid-cols-2 gap-2 p-2">
            {(["delivery", "pickup"] as const).map((m) => {
              const active = mode === m;
              const Icon = m === "delivery" ? Bike : Store;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseMode(m)}
                  className={cn(
                    "flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-3 text-body font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-transparent bg-secondary text-foreground hover:border-primary/30"
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  {SERVICE_LABELS[m]}
                </button>
              );
            })}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 text-body-sm text-muted-foreground">
            {mode === "delivery" ? (
              <>
                <li className="flex items-center gap-1.5">
                  <Clock aria-hidden className="size-4 text-primary" />
                  {delivery ? `${delivery.delivery_time_min}–${delivery.delivery_time_max} min` : "Tiempo por confirmar"}
                </li>
                <li className="flex items-center gap-1.5">
                  <Bike aria-hidden className="size-4 text-primary" />
                  {freeFrom ? `Envío gratis desde ${formatPrice(freeFrom)}` : "Envío por cotizar"}
                </li>
                {minPurchase && (
                  <li className="flex items-center gap-1.5">
                    <ShoppingBag aria-hidden className="size-4 text-primary" />
                    Compra mínima {formatPrice(minPurchase)}
                  </li>
                )}
              </>
            ) : (
              <>
                <li className="flex items-center gap-1.5">
                  <Clock aria-hidden className="size-4 text-primary" />
                  Listo en unos {delivery?.pickup_time ?? 15} min
                </li>
                {restaurantAddress && (
                  <li className="flex min-w-0 items-center gap-1.5">
                    <MapPin aria-hidden className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{restaurantAddress}</span>
                  </li>
                )}
              </>
            )}
          </ul>
        </section>

        {promotions.length > 0 && (
          <section
            aria-label="Promociones de hoy"
            className="flex flex-col gap-2 rounded-2xl border border-money-in-border bg-money-in-soft px-4 py-3"
          >
            <p className="flex items-center gap-2 text-body-sm font-semibold text-money-in-soft-foreground">
              <Tag aria-hidden className="size-4" />
              Promociones de hoy
            </p>
            <ul className="flex flex-wrap gap-2">
              {promotions.map((p) => (
                <li
                  key={p.id}
                  className="rounded-full border border-money-in-border bg-card px-3 py-1 text-caption font-semibold text-foreground"
                >
                  {p.name} · {p.label}
                </li>
              ))}
            </ul>
            <p className="text-caption text-money-in-soft-foreground">El descuento se aplica solo en tu pedido.</p>
          </section>
        )}
      </div>

      <MenuToolbar
        nav={nav}
        categories={visibleCategories}
        query={query}
        onQueryChange={setQuery}
        placeholder="Buscar en el menú"
        searchLabel="Buscar en el menú"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {results === null && (
          <SuggestionsRow suggestions={suggestions} onSelectProduct={selectProduct} onAddCombo={addCombo} />
        )}
        {results === null ? (
          <MenuSectionList
            nav={nav}
            title="El menú"
            categories={visibleCategories}
            onSelectProduct={selectProduct}
            cartQuantities={cartQuantities}
            promos={promos}
          />
        ) : (
          <MenuSearchResults
            query={query}
            results={results}
            onClear={() => setQuery("")}
            onSelectProduct={selectProduct}
            cartQuantities={cartQuantities}
            promos={promos}
            emptyAction="Ver todo el menú"
          />
        )}
      </div>

      <ProductSheet
        product={selected}
        detail={selected ? productDetails[selected.id] : undefined}
        onOpenChange={(open) => !open && setSelected(null)}
        onAdd={(product, quantity, notes, choice) => {
          cart.addItem(product, quantity, notes, choice);
          notify.itemAdded(product.name);
        }}
      />

      <OrderSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        slug={slug}
        mode={mode}
        onModeChange={chooseMode}
        digital={digital}
        cart={cart}
        hiddenIds={hidden}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur-md"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -10px 28px -16px rgb(15 23 42 / 0.28)",
        }}
      >
        <div className="relative mx-auto w-full max-w-3xl px-4 pt-3">
          <BackToTopButton nav={nav} />
          {cart.itemCount > 0 ? (
            <Button
              size="lg"
              className="clay clay-primary h-14 w-full justify-between rounded-2xl px-4 text-body-lg font-semibold"
              onClick={() => setSheetOpen(true)}
              aria-label={`Ver pedido con ${cart.itemCount} productos`}
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
              <span className="font-display text-title font-bold tabular-nums">{formatPrice(cart.total)}</span>
            </Button>
          ) : (
            <p className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-body-sm text-muted-foreground">
              <ShoppingBag aria-hidden className="size-4" />
              {accepting ? "Toca un producto para agregarlo" : "Puedes ver el menú; los pedidos están cerrados"}
            </p>
          )}
        </div>
      </div>
    </MenuNavRoot>
  );
}
