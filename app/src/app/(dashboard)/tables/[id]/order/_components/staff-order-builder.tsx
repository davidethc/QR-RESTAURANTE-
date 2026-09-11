"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, PencilLine, Check, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createStaffOrder } from "@/lib/actions/orders";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { useStaffCart } from "@/hooks/use-staff-cart";
import type { PublicCategory, PublicProduct } from "@/types/menu";
import type { TopProduct } from "@/types/staff";

export function StaffOrderBuilder({
  categories,
  topProducts,
  tableId,
  tableLabel,
}: {
  categories: PublicCategory[];
  topProducts: TopProduct[];
  tableId: string;
  tableLabel: string;
}) {
  const router = useRouter();
  const cart = useStaffCart();
  const [query, setQuery] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set()
  );

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

  async function handleSend() {
    const result = await createStaffOrder(tableId, cart.items);
    if (result.ok) {
      cart.clear();
      router.push("/tables");
      router.refresh();
    }
    return result;
  }

  return (
    <div className="pb-44">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato…"
            className="h-11 rounded-full pl-9 pr-9 text-[15px]"
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
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <Flame className="size-3.5" /> Los más pedidos
          </p>
          <div className="flex flex-wrap gap-2">
            {topProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => cart.addItem(product)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[14px] font-semibold active:scale-[0.97]"
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
              onAdd={(p) => cart.addItem(p)}
              quantityOf={cart.quantityOf}
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
                  className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left active:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-[20px] leading-none transition-transform duration-200",
                      isOpen && "scale-105",
                    )}
                  >
                    {getCategoryIcon(category.name)}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-display truncate text-[17px] font-bold leading-tight text-foreground">
                        {category.name}
                      </span>
                      <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                        {available.length} {available.length === 1 ? "plato" : "platos"}
                      </span>
                    </span>
                    {!isOpen && (
                      <span className="truncate text-[13px] leading-snug text-muted-foreground">
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
                    onAdd={(p) => cart.addItem(p)}
                    quantityOf={cart.quantityOf}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      {cart.items.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 pt-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0_/_0.15)]"
          style={{
            paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="mx-auto max-w-3xl">
            <ul className="mb-3 max-h-52 space-y-1.5 overflow-y-auto">
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
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {item.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingNote(editingNote === item.id ? null : item.id)
                      }
                      aria-label={`Indicación para ${item.name}`}
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        item.notes
                          ? "bg-honey-soft text-honey-soft-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <PencilLine className="size-4" />
                    </button>
                    <span className="w-16 shrink-0 text-right text-[14px] font-semibold tabular-nums text-wine">
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
                        className="rounded-xl text-[14px]"
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
                  className="clay clay-primary h-13 w-full justify-between rounded-2xl px-5 text-[15px]"
                >
                  <span>
                    Enviar pedido · {cart.count}{" "}
                    {cart.count === 1 ? "plato" : "platos"}
                  </span>
                  <span className="font-display text-[20px] font-bold tabular-nums">
                    {formatPrice(cart.total)}
                  </span>
                </Button>
              }
              title={`¿Enviar el pedido de ${tableLabel}?`}
              description={`${cart.count} ${
                cart.count === 1 ? "plato" : "platos"
              } por ${formatPrice(cart.total)}. Pasa directo a cocina.`}
              confirmLabel="Enviar"
              action={handleSend}
              onSuccess={() => notify.success("Pedido enviado a cocina")}
            />
          </div>
        </div>
      )}
    </div>
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
    <ul className="divide-y divide-border/60 overflow-hidden bg-card mx-4 mb-3 rounded-2xl">
      {products.map((product) => {
        const inCart = quantityOf(product.id);

        return (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onAdd(product)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-secondary"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                {product.name}
              </span>
              {inCart > 0 && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold tabular-nums text-primary-foreground">
                  {inCart}
                </span>
              )}
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-wine">
                {formatPrice(product.price)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
