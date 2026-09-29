"use client";

import { useMemo, useRef, useState } from "react";
import { ChefHat, Flame, Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { EmptyState } from "@/components/shared/empty-state";
import { useStaffCart } from "@/hooks/use-staff-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { addItemsToBill, getChargeMenu } from "@/lib/actions/billing";
import { getCategoryIcon } from "@/lib/category-icons";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import type { Bill } from "@/types/billing";
import type { PublicCategory, PublicProduct } from "@/types/menu";
import type { TopProduct } from "@/types/staff";

/**
 * "+ Agregar producto" dentro de la hoja de cobro: el cliente pide algo más
 * en el momento de pagar (un agua, un postre para llevar). Arma una tanda con
 * el mismo carrito que Venta rápida y la suma a ESTA cuenta con
 * `add_items_to_bill`. Por defecto el pedido nace entregado (se lo llevó de la
 * barra); con "Mandar a cocina" entra a cocina como cualquier pedido.
 *
 * La carta se pide al abrir (no viaja con la hoja, que vive en el layout).
 * La clave de idempotencia se reutiliza en reintentos de la MISMA tanda y
 * cambia en cuanto cambia el carrito (o "Mandar a cocina"): con la clave
 * vieja, la base devolvería la tanda anterior en vez de agregar la nueva.
 */
export function ChargeProductPicker({
  billId,
  onAdded,
}: {
  billId: string;
  onAdded: (bill: Bill) => void;
}) {
  const cart = useStaffCart();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ categories: PublicCategory[]; topProducts: TopProduct[] } | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const [sendToKitchen, setSendToKitchen] = useState(false);
  const [pending, setPending] = useState(false);
  // Un envío que falló pudo haber llegado a la base (wifi). Mientras no se
  // resuelva, cerrar la hoja conserva carrito y clave: el reintento no duplica.
  const unresolvedSend = useRef(false);
  const batchLines = useMemo(
    () =>
      cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
    [cart.items]
  );
  const batchKey = useIdempotencyKey(JSON.stringify([batchLines, sendToKitchen]));

  const results = useMemo(() => {
    const term = normalizeText(query.trim());
    if (!term || !menu) return null;
    return menu.categories
      .flatMap((c) => c.products)
      .filter((p) => p.available && normalizeText(p.name).includes(term));
  }, [menu, query]);

  function loadMenu() {
    setMenuError(null);
    getChargeMenu().then((result) => {
      if (!result.ok) {
        setMenuError(result.error);
        return;
      }
      setMenu(result.data);
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      if (!unresolvedSend.current) batchKey.renew();
      if (!menu) loadMenu();
    } else if (!unresolvedSend.current) {
      cart.clear();
      setQuery("");
      setSendToKitchen(false);
    }
  }

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setPending(true);
    const result = await addItemsToBill({
      billId,
      items: batchLines,
      idempotencyKey: batchKey.get(),
      sendToKitchen,
    });
    setPending(false);
    if (!result.ok) {
      unresolvedSend.current = true;
      notify.error(result.error);
      return;
    }
    unresolvedSend.current = false;
    notify.success(
      result.data.replayed
        ? "Esos productos ya estaban agregados"
        : sendToKitchen
          ? "Agregado a la cuenta y enviado a cocina"
          : "Agregado a la cuenta"
    );
    onAdded(result.data);
    handleOpenChange(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-full text-body-sm font-semibold"
        onClick={() => handleOpenChange(true)}
      >
        <Plus className="h-4 w-4" /> Agregar producto
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="h-[88vh] gap-0 rounded-t-3xl p-0 sm:mx-auto sm:max-w-lg sm:border-x">
          <SheetHeader className="border-b border-border px-4 pb-3">
            <SheetTitle className="text-title-sm">Agregar a la cuenta</SheetTitle>
            <SheetDescription>Se suma al saldo de esta cuenta.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pb-48">
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar plato…"
                  aria-label="Buscar plato"
                  className="h-11 rounded-full pl-9 pr-9 text-body"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>

            {!menu && !menuError && (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando la carta" />
              </div>
            )}

            {menuError && (
              <div className="p-4">
                <p role="alert" className="rounded-control border border-destructive/30 bg-destructive-soft p-3 text-body-sm text-destructive">
                  {menuError}
                </p>
                <Button variant="outline" className="mt-3 h-11 w-full rounded-full" onClick={loadMenu}>
                  Reintentar
                </Button>
              </div>
            )}

            {menu && !results && menu.topProducts.length > 0 && (
              <section className="px-4 pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Flame aria-hidden className="size-3.5" /> Los más pedidos
                </p>
                <div className="flex flex-wrap gap-2">
                  {menu.topProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => cart.addItem(product)}
                      className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-body-sm font-semibold active:scale-[0.97]"
                    >
                      {product.name}
                      <span className="tabular-nums text-foreground">{formatPrice(product.price)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {menu &&
              (results ? (
                <section className="pt-4">
                  {results.length === 0 ? (
                    <EmptyState title="Sin resultados" description={`Ningún plato coincide con "${query}".`} />
                  ) : (
                    <ProductList products={results} onAdd={(p) => cart.addItem(p)} quantityOf={cart.quantityOf} />
                  )}
                </section>
              ) : (
                <div className="flex flex-col border-b border-border pt-2">
                  {menu.categories.map((category) => {
                    const available = category.products.filter((p) => p.available);
                    if (available.length === 0) return null;
                    const isOpen = openCategories.has(category.id);
                    return (
                      <section key={category.id}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(category.id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left active:bg-muted"
                        >
                          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control bg-secondary text-title leading-none">
                            {getCategoryIcon(category.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-lead font-semibold text-foreground">
                            {category.name}
                          </span>
                          <span className="shrink-0 text-meta tabular-nums text-muted-foreground">
                            {available.length}
                          </span>
                        </button>
                        {isOpen && (
                          <ProductList products={available} onAdd={(p) => cart.addItem(p)} quantityOf={cart.quantityOf} />
                        )}
                      </section>
                    );
                  })}
                </div>
              ))}
          </div>

          {cart.items.length > 0 && (
            <div
              className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pt-3 shadow-sheet"
              style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <ul className="mb-3 max-h-32 space-y-1.5 overflow-y-auto">
                {cart.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <QuantityStepper
                      compact
                      min={0}
                      label={item.name}
                      value={item.quantity}
                      onChange={(q) => cart.setQuantity(item.id, q)}
                    />
                    <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{item.name}</span>
                    <span className="w-16 shrink-0 text-right text-body-sm font-semibold tabular-nums text-foreground">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <label className="mb-3 flex min-h-11 items-center gap-3 rounded-control bg-secondary px-3 text-body-sm">
                <ChefHat aria-hidden className="size-4 text-muted-foreground" />
                <span className="flex-1">Mandar a cocina</span>
                <Switch checked={sendToKitchen} onCheckedChange={setSendToKitchen} aria-label="Mandar a cocina" />
              </label>

              <Button
                size="lg"
                disabled={pending}
                onClick={handleConfirm}
                className="h-13 w-full justify-between rounded-control px-5 text-body"
              >
                <span className="flex items-center gap-2">
                  {pending && <Loader2 className="animate-spin" />}
                  Agregar · {cart.count} {cart.count === 1 ? "plato" : "platos"}
                </span>
                <span className="text-title font-semibold tabular-nums">{formatPrice(cart.total)}</span>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ProductList({
  products,
  onAdd,
  quantityOf,
}: {
  products: PublicProduct[];
  onAdd: (product: PublicProduct) => void;
  quantityOf: (productId: string) => number;
}) {
  return (
    <ul className="mx-4 mb-3 divide-y divide-border overflow-hidden rounded-card bg-card">
      {products.map((product) => {
        const inCart = quantityOf(product.id);
        return (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onAdd(product)}
              className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-secondary")}
            >
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{product.name}</span>
              {inCart > 0 && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold tabular-nums text-primary-foreground">
                  {inCart}
                </span>
              )}
              <span className="shrink-0 text-body font-semibold tabular-nums text-foreground">
                {formatPrice(product.price)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
