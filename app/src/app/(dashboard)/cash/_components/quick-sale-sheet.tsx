"use client";

import { useMemo, useState } from "react";
import { Search, X, PencilLine, Check, ShoppingBag, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createCounterSale } from "@/lib/actions/counter";
import { useChargeSheet } from "./charge-sheet-host";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { useStaffCart } from "@/hooks/use-staff-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { useOnline } from "@/hooks/use-online";
import type { PublicCategory, PublicProduct } from "@/types/menu";
import type { TopProduct } from "@/types/staff";

/**
 * "Venta rápida": vender a alguien que no se sienta (para llevar), sin
 * pasar por Mesas. Arma el pedido igual que `StaffOrderBuilder` — mismo
 * carrito, misma lista de productos — y al confirmar crea la venta
 * (`createCounterSale`, va a cocina sola) y abre de una vez la hoja de
 * cobro existente: lo normal es cobrar antes de entregar.
 *
 * Requiere caja abierta (la RPC no lo exige, pero cobrar sin turno abierto
 * no tiene dónde registrarse): si no hay una, el botón lo dice en vez de
 * abrir la hoja.
 */
export function QuickSaleSheet({
  categories,
  topProducts,
  maxWaiterDiscountPct,
  hasOpenSession,
}: {
  categories: PublicCategory[];
  topProducts: TopProduct[];
  maxWaiterDiscountPct: number;
  hasOpenSession: boolean;
}) {
  const { openCharge } = useChargeSheet();
  const cart = useStaffCart();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const online = useOnline();
  // Se reutiliza en cada reintento de la MISMA venta (createCounterSale, C5):
  // si la red falla a mitad de camino, reintentar no manda un segundo pedido
  // a cocina. Si el carrito o el nombre cambian, es otra venta y otra clave.
  const saleLines = useMemo(
    () =>
      cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
    [cart.items]
  );
  const customerLabel = customerName.trim() || undefined;
  const saleKey = useIdempotencyKey(JSON.stringify([saleLines, customerLabel ?? null]));

  const results = useMemo(() => {
    const term = normalizeText(query.trim());
    if (!term) return null;
    return categories.flatMap((c) => c.products).filter((p) => p.available && normalizeText(p.name).includes(term));
  }, [categories, query]);

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    cart.clear();
    setQuery("");
    setCustomerName("");
    setEditingNote(null);
    saleKey.renew();
  }

  function handleTriggerClick() {
    if (!hasOpenSession) {
      notify.error("Abre la caja antes de vender");
      return;
    }
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    // Cerrar sin confirmar (la "X", tocar fuera) descarta el pedido a medio
    // armar — nunca queda una venta a medias esperando en segundo plano.
    if (!next) reset();
    setOpen(next);
  }

  async function handleConfirm() {
    return createCounterSale({
      items: saleLines,
      customerLabel,
      idempotencyKey: saleKey.get(),
    });
  }

  return (
    <>
      <Button
        onClick={handleTriggerClick}
        size="lg"
        className="h-14 w-full gap-2 rounded-control text-body font-semibold"
      >
        <ShoppingBag aria-hidden className="size-5" /> Venta rápida
      </Button>
      {!hasOpenSession && (
        <p className="mt-1.5 text-center text-caption text-muted-foreground">
          Para llevar, sin mesa. Abre la caja primero para poder cobrarla.
        </p>
      )}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92vh] gap-0 rounded-t-3xl p-0 sm:mx-auto sm:max-w-lg sm:border-x"
        >
          <SheetHeader className="border-b border-border px-4 pb-3">
            <SheetTitle className="text-title-sm">Venta rápida</SheetTitle>
            <SheetDescription>Para llevar. Se manda a cocina y se cobra antes de entregar.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pb-44">
            <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar plato…"
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

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="counter-customer-name">Nombre del cliente (opcional)</FieldLabel>
                  <Input
                    id="counter-customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej: Ana"
                    maxLength={40}
                    className="h-11 rounded-control text-body"
                  />
                </Field>
              </FieldGroup>
            </div>

            {!results && topProducts.length > 0 && (
              <section className="px-4 pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Flame aria-hidden className="size-3.5" /> Los más pedidos
                </p>
                <div className="flex flex-wrap gap-2">
                  {topProducts.map((product) => (
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

            {results ? (
              <section className="px-4 pt-4">
                {results.length === 0 ? (
                  <EmptyState title="Sin resultados" description={`Ningún plato coincide con "${query}".`} />
                ) : (
                  <ProductList products={results} onAdd={(p) => cart.addItem(p)} quantityOf={cart.quantityOf} />
                )}
              </section>
            ) : (
              <div className="flex flex-col border-b border-border pt-2">
                {categories.map((category) => {
                  const available = category.products.filter((p) => p.available);
                  if (available.length === 0) return null;

                  const isOpen = openCategories.has(category.id);
                  const previewNames = available.slice(0, 3).map((p) => p.name);
                  const remaining = available.length - previewNames.length;

                  return (
                    <section key={category.id}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left active:bg-muted"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-control bg-secondary text-title leading-none transition-transform duration-200",
                            isOpen && "scale-105"
                          )}
                        >
                          {getCategoryIcon(category.name)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-lead font-semibold leading-tight text-foreground">
                              {category.name}
                            </span>
                            <span className="shrink-0 text-meta tabular-nums text-muted-foreground">
                              {available.length} {available.length === 1 ? "plato" : "platos"}
                            </span>
                          </span>
                          {!isOpen && (
                            <span className="truncate text-meta leading-snug text-muted-foreground">
                              {previewNames.join(" · ")}
                              {remaining > 0 && <span className="text-muted-foreground/60"> +{remaining}</span>}
                            </span>
                          )}
                        </span>
                      </button>

                      {isOpen && (
                        <ProductList products={available} onAdd={(p) => cart.addItem(p)} quantityOf={cart.quantityOf} />
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {cart.items.length > 0 && (
            <div
              className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pt-3 shadow-sheet"
              style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <ul className="mb-3 max-h-40 space-y-1.5 overflow-y-auto">
                {cart.items.map((item) => (
                  <li key={item.id}>
                    <div className="flex items-center gap-2">
                      <QuantityStepper
                        compact
                        min={0}
                        label={item.name}
                        value={item.quantity}
                        onChange={(q) => cart.setQuantity(item.id, q)}
                      />
                      <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{item.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditingNote(editingNote === item.id ? null : item.id)}
                        aria-label={`Indicación para ${item.name}`}
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full",
                          item.notes ? "bg-warning-soft text-warning-soft-foreground" : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <PencilLine className="size-4" />
                      </button>
                      <span className="w-16 shrink-0 text-right text-body-sm font-semibold tabular-nums text-foreground">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>

                    {editingNote === item.id && (
                      <div className="mt-1.5 flex items-start gap-2 pl-2">
                        <Textarea
                          value={item.notes}
                          onChange={(e) => cart.setNotes(item.id, e.target.value)}
                          placeholder="Ej: sin cebolla, término medio…"
                          rows={2}
                          autoFocus
                          className="rounded-control text-body-sm"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Listo"
                          className="size-9 shrink-0 rounded-full"
                          onClick={() => setEditingNote(null)}
                        >
                          <Check className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <ConfirmDialog
                trigger={
                  <Button
                    size="lg"
                    disabled={!online}
                    title={online ? undefined : "Sin conexión: espera a que vuelva la red"}
                    className="h-13 w-full justify-between rounded-control px-5 text-body"
                  >
                    <span>
                      {online ? "Cobrar" : "Sin conexión"} · {cart.count} {cart.count === 1 ? "plato" : "platos"}
                    </span>
                    <span className="text-title font-semibold tabular-nums">{formatPrice(cart.total)}</span>
                  </Button>
                }
                title="¿Confirmar venta para llevar?"
                description={`${cart.count} ${cart.count === 1 ? "plato" : "platos"} por ${formatPrice(cart.total)}. Pasa directo a cocina y abre la hoja de cobro.`}
                confirmLabel="Confirmar"
                action={handleConfirm}
                onSuccess={(sale) => {
                  notify.success(`${sale.place_label} · pedido en cocina`);
                  setOpen(false);
                  reset();
                  openCharge({
                    tableSessionId: sale.table_session_id,
                    tableLabel: sale.place_label,
                    maxWaiterDiscountPct,
                  });
                }}
              />
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
    <ul className="divide-y divide-border overflow-hidden bg-card mx-4 mb-3 rounded-card">
      {products.map((product) => {
        const inCart = quantityOf(product.id);
        return (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onAdd(product)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-secondary"
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
