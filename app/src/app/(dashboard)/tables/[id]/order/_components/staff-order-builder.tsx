"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChefHat,
  Flame,
  Loader2,
  Pencil,
  ReceiptText,
  RotateCcw,
  Search,
  Split,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { posPressable, toneSolid, toneSoft } from "@/components/shared/pos-tone";
import { addTicket, reopenTable } from "@/lib/actions/orders";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { fromPrice, modifiersPrice } from "@/lib/order-lines";
import { getCategoryIcon } from "@/lib/category-icons";
import { useStaffCart } from "@/hooks/use-staff-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { TicketView } from "@/lib/queries/staff-catalog";
import { ProductSheet, type SheetProduct } from "./product-sheet";
import { TicketsDetail } from "./tickets-detail";
import type {
  PublicCategory,
  PublicProduct,
  StaffCartItem,
  StaffProductDetail,
} from "@/types/menu";
import type { TopProduct } from "@/types/staff";

const TOP = "__top__";

type View = "menu" | "sent";

/**
 * Taking a table's order with the same full-screen builder feel as Caja's
 * "Nuevo pedido": categories rail, big product tiles (one tap adds when the
 * product has no choices), the new ticket always visible on the right (a
 * drawer on phone) and one big "Enviar a cocina". What was already sent
 * lives in its own tab ("Ya enviado"): edit, cancel with reason, print.
 */
export function StaffOrderBuilder({
  categories,
  topProducts,
  details,
  tableId,
  orderId,
  tableLabel,
  tickets,
  reopenSessionId,
  initialView = "menu",
}: {
  categories: PublicCategory[];
  topProducts: TopProduct[];
  details: Record<string, StaffProductDetail>;
  tableId: string;
  /** Pedido vigente de la mesa; null = la primera comanda lo crea. */
  orderId: string | null;
  tableLabel: string;
  /** Comandas ya enviadas del pedido vigente. */
  tickets: TicketView[];
  /** Sesión de la mesa solo si pidió la cuenta: habilita "Reabrir mesa". */
  reopenSessionId: string | null;
  initialView?: View;
}) {
  const router = useRouter();
  const cart = useStaffCart();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [view, setView] = useState<View>(tickets.length > 0 ? initialView : "menu");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ product: SheetProduct; editing: StaffCartItem | null } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [reopening, startReopen] = useTransition();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [pulse, setPulse] = useState<string | null>(null);

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

  const available = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, products: c.products.filter((p) => p.available) }))
        .filter((c) => c.products.length > 0),
    [categories]
  );
  const top = useMemo(() => {
    const byId = new Map(available.flatMap((c) => c.products).map((p) => [p.id, p]));
    return topProducts.map((t) => byId.get(t.id)).filter((p): p is PublicProduct => !!p);
  }, [available, topProducts]);
  const rail = useMemo(
    () => [
      ...(top.length > 0 ? [{ id: TOP, name: "Más pedidos", products: top }] : []),
      ...available.map((c) => ({ id: c.id, name: c.name, products: c.products })),
    ],
    [available, top]
  );
  const activeCategory = category ?? rail[0]?.id ?? null;
  const results = useMemo(() => {
    const term = normalizeText(query.trim());
    if (!term) return null;
    return available.flatMap((c) => c.products).filter((p) => normalizeText(p.name).includes(term));
  }, [available, query]);
  const visible = results ?? rail.find((c) => c.id === activeCategory)?.products ?? [];

  const sentTotal = tickets.reduce(
    (sum, t) => sum + t.items.filter((i) => !i.cancelled).reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    0
  );

  function addProduct(p: PublicProduct) {
    const detail = details[p.id];
    const variants = detail?.variants ?? [];
    const groups = detail?.groups ?? [];
    if (groups.length === 0 && variants.length <= 1) {
      cart.addLine({
        productId: p.id,
        name: p.name,
        price: variants[0]?.price ?? p.price,
        quantity: 1,
        notes: "",
        variantId: variants[0]?.id,
        variantName: variants[0]?.name || undefined,
      });
      setSaveError(null);
      setPulse(p.id);
      window.setTimeout(() => setPulse((cur) => (cur === p.id ? null : cur)), 260);
      return;
    }
    setSheet({ product: { id: p.id, name: p.name, description: p.description, price: p.price }, editing: null });
  }

  function editLine(item: StaffCartItem) {
    setTicketOpen(false);
    setSheet({
      product: {
        id: item.productId,
        name: item.name,
        price: item.price - modifiersPrice(details[item.productId]?.groups ?? [], item.selections ?? {}),
      },
      editing: item,
    });
  }

  function handleSave() {
    if (cart.items.length === 0) {
      setSaveError("Agrega al menos un producto");
      return;
    }
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
      setTicketOpen(false);
      notify.success(`Comanda #${result.data.ticketNumber} enviada a cocina`);
      router.refresh();
    });
  }

  function reopen() {
    if (!reopenSessionId) return;
    startReopen(async () => {
      const r = await reopenTable(reopenSessionId);
      if (!r.ok) {
        notify.error(r.error);
        return;
      }
      notify.success("Mesa reabierta");
      router.refresh();
    });
  }

  const ticket = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {reopenSessionId && (
          <div className={cn("mb-4 rounded-card border p-3", toneSoft.attention)}>
            <p className="flex items-center gap-2 text-body-sm font-semibold">
              <ReceiptText className="size-4 shrink-0" aria-hidden /> La mesa pidió la cuenta
            </p>
            <p className="mt-0.5 text-meta">Reábrela para agregar productos.</p>
            <button
              type="button"
              disabled={reopening}
              onClick={reopen}
              className={cn(posPressable, "mt-2 flex min-h-12 items-center gap-2 rounded-button border-2 border-attention-border bg-card px-4 text-body-sm font-semibold text-foreground")}
            >
              {reopening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
              Reabrir mesa
            </button>
          </div>
        )}

        <h2 className="mb-2 flex items-baseline justify-between gap-2 text-body font-semibold text-foreground max-lg:pr-12">
          Nueva comanda
          {cart.count > 0 && (
            <span className="text-meta font-medium tabular-nums text-muted-foreground">
              {cart.count} {cart.count === 1 ? "producto" : "productos"}
            </span>
          )}
        </h2>
        {cart.items.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
            Toca un producto para agregarlo.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {cart.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-foreground">
                      {item.name}
                      {item.variantName ? ` · ${item.variantName}` : ""}
                    </span>
                    {item.modifiers && <span className="block text-meta text-muted-foreground">{item.modifiers}</span>}
                    {item.notes && <span className="block text-meta text-attention-soft-foreground">“{item.notes}”</span>}
                  </span>
                  <span className="shrink-0 text-body-sm font-semibold tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <QuantityStepper compact min={0} label={item.name} value={item.quantity} onChange={(q) => cart.setQuantity(item.id, q)} />
                  <button
                    type="button"
                    onClick={() => editLine(item)}
                    aria-label={`Editar ${item.name} (nota, variante)`}
                    className="ml-auto flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  {item.quantity > 1 && (
                    <button
                      type="button"
                      onClick={() => cart.splitOne(item.id)}
                      aria-label={`Separar uno de ${item.name}`}
                      className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <Split className="size-4" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cart.remove(item.id)}
                    aria-label={`Quitar ${item.name}`}
                    className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-money-out-soft hover:text-money-out-soft-foreground"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tickets.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTicketOpen(false);
              setView("sent");
            }}
            className={cn(posPressable, "mt-4 flex min-h-12 w-full items-center justify-between gap-2 rounded-card border border-border bg-secondary px-4 text-left text-body-sm font-semibold text-foreground hover:bg-muted")}
          >
            <span className="flex items-center gap-2">
              <ChefHat className="size-4 text-muted-foreground" aria-hidden />
              Ya enviado · {tickets.length} {tickets.length === 1 ? "comanda" : "comandas"}
            </span>
            <span className="tabular-nums">{formatPrice(sentTotal)}</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {saveError && (
          <p role="alert" className="text-body-sm font-medium text-money-out-soft-foreground">
            {saveError}
          </p>
        )}
        <p className="flex items-baseline justify-between">
          <span className="text-body font-semibold text-foreground">Total de la comanda</span>
          <span className="text-title font-semibold tabular-nums text-foreground">{formatPrice(cart.total)}</span>
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className={cn(posPressable, "flex min-h-14 items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md", toneSolid.neutral)}
        >
          {saving ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ChefHat className="size-5" aria-hidden />}
          Enviar a cocina
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 md:px-4">
        <Link
          href="/tables"
          onClick={(e) => {
            if (cart.items.length > 0) {
              e.preventDefault();
              setConfirmExit(true);
            }
          }}
          className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button px-3 text-body font-semibold text-foreground hover:bg-muted")}
        >
          <ArrowLeft className="size-5" aria-hidden /> <span className="max-sm:sr-only">Mesas</span>
        </Link>
        <h1 className="flex min-h-12 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-body-sm font-semibold text-foreground">
          <UtensilsCrossed className="size-4" aria-hidden /> {tableLabel}
        </h1>
        {tickets.length > 0 && (
          <SegmentedControl
            aria-label="Vista"
            value={view}
            onValueChange={setView}
            options={[
              { value: "menu", label: "Carta" },
              { value: "sent", label: <span className="tabular-nums">Ya enviado · {tickets.length}</span> },
            ]}
          />
        )}
        {view === "menu" && (
          <div className="relative w-full md:ml-auto md:w-auto md:max-w-sm md:flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              aria-label="Buscar producto"
              className="h-12 rounded-full pr-10 pl-9 text-body"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          view === "menu"
            ? "grid-rows-[auto_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-[11rem_minmax(0,1fr)_22rem] xl:grid-cols-[13rem_minmax(0,1fr)_24rem]"
            : "grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
        )}
      >
        {view === "menu" ? (
          <>
            <nav aria-label="Categorías" className="border-b border-border bg-card lg:overflow-y-auto lg:border-r lg:border-b-0">
              <ul className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:px-2 lg:py-3">
                {rail.map((c) => {
                  const active = !results && c.id === activeCategory;
                  return (
                    <li key={c.id} className="shrink-0">
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          setCategory(c.id);
                          setQuery("");
                        }}
                        className={cn(
                          posPressable,
                          "flex min-h-12 w-full items-center gap-2 rounded-button px-3 text-left text-body-sm font-semibold",
                          active ? "bg-foreground text-background" : "text-foreground hover:bg-muted"
                        )}
                      >
                        {c.id === TOP ? (
                          <Flame className="size-4 shrink-0" aria-hidden />
                        ) : (
                          <span aria-hidden className="text-lead leading-none">{getCategoryIcon(c.name)}</span>
                        )}
                        <span className="whitespace-nowrap lg:truncate lg:whitespace-normal">{c.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <section aria-label="Productos" className="min-h-0 overflow-y-auto overscroll-contain p-3 pb-28 md:p-4 lg:pb-4">
              {results && <p className="mb-3 text-meta text-muted-foreground">{results.length} resultado(s) para “{query}”</p>}
              {visible.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-border bg-card px-6 py-10 text-center">
                  <p className="text-body font-semibold text-foreground">{results ? "Sin resultados" : "No hay productos disponibles"}</p>
                  <p className="text-body-sm text-muted-foreground">
                    {results ? `Ningún producto coincide con “${query}”.` : "Revisa la disponibilidad de la carta."}
                  </p>
                  {results ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className={cn(posPressable, "flex min-h-12 items-center rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold hover:bg-muted")}
                    >
                      Ver toda la carta
                    </button>
                  ) : (
                    <Link
                      href="/availability"
                      className={cn(posPressable, "flex min-h-12 items-center rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold hover:bg-muted")}
                    >
                      Ir a Disponibilidad
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
                  {visible.map((p) => {
                    const inCart = cart.quantityOf(p.id);
                    const { price, hasChoice } = fromPrice(p.price, details[p.id]?.variants);
                    const hasExtras = (details[p.id]?.groups.length ?? 0) > 0;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addProduct(p)}
                          aria-label={`${p.name}, ${hasChoice ? "desde " : ""}${formatPrice(price)}${inCart ? `, ${inCart} en la comanda` : ""}`}
                          className={cn(
                            posPressable,
                            "relative flex h-full min-h-28 w-full flex-col justify-between gap-2 rounded-card border-2 bg-card p-3 text-left",
                            inCart > 0 ? "border-money-in-border" : "border-transparent shadow-sm hover:border-border",
                            pulse === p.id && "scale-[0.97]"
                          )}
                        >
                          <span className="line-clamp-3 text-body font-semibold leading-snug text-foreground">{p.name}</span>
                          <span className="flex items-end justify-between gap-2">
                            <span className="text-body-sm font-semibold tabular-nums text-muted-foreground">
                              {hasChoice ? "Desde " : ""}
                              {formatPrice(price)}
                            </span>
                            {(hasChoice || hasExtras) && <span className="text-caption text-muted-foreground">Elegir</span>}
                          </span>
                          {inCart > 0 && (
                            <span className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-money-in text-body-sm font-bold tabular-nums text-money-in-foreground shadow-md">
                              {inCart}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section aria-label="Ya enviado" className="min-h-0 overflow-y-auto overscroll-contain p-3 pb-28 md:p-4 lg:pb-4">
            <TicketsDetail tableLabel={tableLabel} tickets={tickets} details={details} />
          </section>
        )}

        <aside aria-label="Comanda" className="hidden min-h-0 border-l border-border bg-card lg:flex lg:flex-col">
          {ticket}
        </aside>
      </div>

      {/* Teléfono: barra con el total que abre la comanda */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className={cn(posPressable, "flex min-h-14 w-full items-center justify-between rounded-button px-5 text-lead font-semibold", toneSolid.neutral)}
        >
          <span>
            Ver comanda · {cart.count} {cart.count === 1 ? "producto" : "productos"}
          </span>
          <span className="tabular-nums">{formatPrice(cart.total)}</span>
        </button>
      </div>

      {!isWide && (
        <Sheet open={ticketOpen} onOpenChange={setTicketOpen}>
          <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-0 rounded-t-3xl p-0">
            <SheetTitle className="sr-only">Comanda de {tableLabel}</SheetTitle>
            <SheetDescription className="sr-only">Productos de la nueva comanda y envío a cocina.</SheetDescription>
            {ticket}
          </SheetContent>
        </Sheet>
      )}

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
            setSaveError(null);
            setSheet(null);
          }}
        />
      )}

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin enviar la comanda?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes {cart.count} {cart.count === 1 ? "producto" : "productos"} sin enviar a cocina. Si sales, se descartan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-12">Seguir armando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-12"
              onClick={() => router.push("/tables")}
            >
              Descartar y salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
