"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Bike, Clock, MapPin, Search, SearchX, ShoppingBag, Store, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategorySection } from "@/app/(public)/r/[slug]/[mesa]/_components/category-section";
import { ProductCard } from "@/app/(public)/r/[slug]/[mesa]/_components/product-card";
import { ProductSheet } from "@/app/(public)/r/[slug]/[mesa]/_components/product-sheet";
import { useLiveMenuCategories } from "@/hooks/use-live-menu";
import { useCart } from "@/hooks/use-cart";
import { notify } from "@/lib/notifications";
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
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const sectionRefCallbacks = useMemo(() => {
    const map: Record<string, (el: HTMLElement | null) => void> = {};
    for (const c of visibleCategories) {
      map[c.id] = (el) => {
        sectionRefs.current[c.id] = el;
      };
    }
    return map;
  }, [visibleCategories]);

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

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToCategory(id: string) {
    setOpenCategories((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const freeFrom = delivery?.free_shipping_enabled ? delivery.free_shipping_min_amount : null;
  const minPurchase = delivery?.min_purchase_enabled ? delivery.min_purchase_amount : null;

  return (
    <div className="flex flex-col gap-5 pb-36">
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

      <div className="glass sticky top-0 z-10 border-y border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <Input
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el menú"
              aria-label="Buscar en el menú"
              className="h-12 rounded-xl border-border bg-card pl-11 pr-11 text-body-lg placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          {results === null && (
            <nav aria-label="Categorías" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {visibleCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => goToCategory(c.id)}
                  className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground hover:border-primary/40"
                >
                  {c.name}
                  <span className="rounded-full bg-secondary px-1.5 text-caption tabular-nums text-muted-foreground">
                    {c.products.length}
                  </span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4">
        {results === null ? (
          <>
            <h2 className="font-display text-title-sm font-bold text-foreground">El menú</h2>
            {visibleCategories.map((c) => (
              <CategorySection
                key={c.id}
                category={c}
                isOpen={openCategories.has(c.id)}
                onToggle={() => toggleCategory(c.id)}
                onSelectProduct={selectProduct}
                cartQuantities={cartQuantities}
                sectionRef={sectionRefCallbacks[c.id]}
              />
            ))}
          </>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <SearchX aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-body font-semibold text-foreground">No encontramos &ldquo;{query}&rdquo;</p>
            <Button type="button" variant="outline" onClick={() => setQuery("")} className="h-11 rounded-xl px-5">
              Ver todo el menú
            </Button>
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            <h2 className="text-body-sm font-semibold text-muted-foreground">
              {results.length} {results.length === 1 ? "resultado" : "resultados"}
            </h2>
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {results.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  categoryName={p.categoryName}
                  onSelect={selectProduct}
                  quantityInCart={cartQuantities[p.id] ?? 0}
                />
              ))}
            </div>
          </section>
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
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
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
    </div>
  );
}
