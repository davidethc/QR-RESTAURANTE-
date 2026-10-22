"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Flame, Pencil, Split, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { EmptyState } from "@/components/shared/empty-state";
import { addTicket } from "@/lib/actions/orders";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { fromPrice, modifiersPrice } from "@/lib/order-lines";
import { getCategoryIcon } from "@/lib/category-icons";
import { useStaffCart } from "@/hooks/use-staff-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { ProductSheet, type SheetProduct } from "./product-sheet";
import type {
  PublicCategory,
  PublicProduct,
  StaffCartItem,
  StaffProductDetail,
} from "@/types/menu";
import type { TopProduct } from "@/types/staff";

export function StaffOrderBuilder({
  categories,
  topProducts,
  details,
  tableId,
  orderId,
}: {
  categories: PublicCategory[];
  topProducts: TopProduct[];
  details: Record<string, StaffProductDetail>;
  tableId: string;
  /** Pedido vigente de la mesa; null = la primera comanda lo crea. */
  orderId: string | null;
}) {
  const router = useRouter();
  const cart = useStaffCart();
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{
    product: SheetProduct;
    editing: StaffCartItem | null;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set()
  );

  // Misma clave mientras el pedido no cambie: reintentar "Enviar" tras un
  // corte de red no duplica la comanda en cocina.
  const orderLines = useMemo(
    () =>
      cart.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        notes: item.notes || undefined,
        ...(item.modifierPicks ? { modifiers: item.modifierPicks } : {}),
      })),
    [cart.items]
  );
  const requestKey = useIdempotencyKey(JSON.stringify([orderId, orderLines]));

  const results = useMemo(() => {
    const term = normalizeText(query.trim());
    if (!term) return null;

    return categories
      .flatMap((c) => c.products)
      .filter(
        (p) => p.available && normalizeText(p.name).includes(term)
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

  function openProduct(product: SheetProduct) {
    setSheet({ product, editing: null });
  }

  function handleSave() {
    setSaveError(null);
    startSaving(async () => {
      const result = await addTicket({
        orderId,
        tableId,
        items: orderLines,
        requestId: requestKey.get(),
      });
      if (!result.ok) {
        setSaveError(result.error);
        notify.error(result.error);
        return;
      }
      requestKey.renew();
      cart.clear();
      notify.success(`Comanda #${result.data.ticketNumber} enviada a cocina`);
      router.refresh();
    });
  }

  return (
    <div className="pb-44">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato…"
            className="h-11 rounded-control pl-9 pr-9 text-body"
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

      {!results && topProducts.length > 0 && (
        <section className="px-4 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-tiny font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <Flame aria-hidden className="size-3.5" /> Los más pedidos
          </p>
          <div className="flex flex-wrap gap-2">
            {topProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => openProduct(product)}
                className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-card px-3.5 text-body-sm font-semibold transition-colors duration-150 active:scale-[0.97]"
              >
                {product.name}
                <span className="tabular-nums text-wine">
                  {formatPrice(product.price)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {results ? (
        <section className="px-4 pt-4">
          {results.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description={`Ningún plato coincide con "${query}".`}
            />
          ) : (
            <ProductList
              products={results}
              onAdd={openProduct}
              quantityOf={cart.quantityOf}
              details={details}
            />
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
                  className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left transition-colors duration-150 active:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-control bg-secondary text-title leading-none",
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
                        {remaining > 0 && (
                          <span className="text-muted-foreground/60"> +{remaining}</span>
                        )}
                      </span>
                    )}
                  </span>
                </button>

                {isOpen && (
                  <ProductList
                    products={available}
                    onAdd={openProduct}
                    quantityOf={cart.quantityOf}
                    details={details}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      <AnimatePresence>
      {cart.items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 pt-3 shadow-sheet"
          style={{
            paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="mx-auto max-w-3xl">
            <ul className="mb-3 max-h-60 space-y-2 overflow-y-auto">
              {cart.items.map((item) => (
                <li key={item.id} className="rounded-control border border-border p-2">
                  <div className="flex items-center gap-2">
                    <QuantityStepper
                      compact
                      min={0}
                      label={item.name}
                      value={item.quantity}
                      onChange={(q) => cart.setQuantity(item.id, q)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium">
                        {item.name}
                        {item.variantName ? ` · ${item.variantName}` : ""}
                      </span>
                      {item.modifiers && (
                        <span className="block text-meta text-muted-foreground">
                          {item.modifiers}
                        </span>
                      )}
                      {item.notes && (
                        <span className="block truncate text-meta text-muted-foreground">
                          {item.notes}
                        </span>
                      )}
                    </span>
                    <span className="w-16 shrink-0 text-right text-body-sm font-semibold tabular-nums text-wine">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 rounded-full"
                      onClick={() =>
                        setSheet({
                          product: {
                            id: item.productId,
                            name: item.name,
                            price:
                              item.price -
                              modifiersPrice(details[item.productId]?.groups ?? [], item.selections ?? {}),
                          },
                          editing: item,
                        })
                      }
                    >
                      <Pencil className="size-4" /> Editar
                    </Button>
                    {item.quantity > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 rounded-full"
                        onClick={() => cart.splitOne(item.id)}
                      >
                        <Split className="size-4" /> Separar uno
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 rounded-full text-destructive"
                      onClick={() => cart.remove(item.id)}
                    >
                      <Trash2 className="size-4" /> Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {saveError && (
              <p role="alert" className="mb-2 text-body-sm font-medium text-destructive">
                {saveError}
              </p>
            )}
            <Button
              size="lg"
              disabled={saving}
              onClick={handleSave}
              className="h-13 w-full justify-between rounded-control px-5 text-body"
            >
              <span className="flex items-center gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Guardar comanda · {cart.count} {cart.count === 1 ? "plato" : "platos"}
              </span>
              <span className="text-title font-semibold tabular-nums">
                {formatPrice(cart.total)}
              </span>
            </Button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {sheet && (
        <ProductSheet
          key={sheet.editing?.id ?? sheet.product.id}
          product={sheet.product}
          detail={details[sheet.product.id]}
          initial={sheet.editing}
          onClose={() => setSheet(null)}
          onConfirm={(line) => {
            if (sheet.editing) cart.replaceLine(sheet.editing.id, line);
            else cart.addLine(line);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

export function ProductList({
  products,
  onAdd,
  quantityOf,
  details,
}: {
  products: PublicProduct[];
  onAdd: (product: PublicProduct) => void;
  quantityOf: (productId: string) => number;
  details: Record<string, StaffProductDetail>;
}) {
  return (
    <ul className="mx-4 mb-3 grid gap-2 sm:grid-cols-2">
      {products.map((product) => {
        const inCart = quantityOf(product.id);
        const { price, hasChoice } = fromPrice(
          product.price,
          details[product.id]?.variants
        );

        return (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onAdd(product)}
              className="flex min-h-14 w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-2.5 text-left transition-colors duration-150 active:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">
                  {product.name}
                </span>
                <span className="block text-meta tabular-nums text-wine">
                  {hasChoice ? "Desde " : ""}
                  {formatPrice(price)}
                </span>
              </span>
              {inCart > 0 && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold tabular-nums text-primary-foreground">
                  {inCart}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
