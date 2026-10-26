"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bike, ChefHat, Coffee, Loader2, Pencil, Search, ShoppingBag, Tag, Trash2, UtensilsCrossed, Wallet, X } from "lucide-react";
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
import { posPressable, toneSolid } from "@/components/shared/pos-tone";
import { useStaffCart } from "@/hooks/use-staff-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getOrderBuilderData, getTableOrderTarget, type OrderBuilderData } from "@/lib/actions/order-builder";
import { createCounterOrder } from "@/lib/actions/counter-order";
import { addTicket } from "@/lib/actions/orders";
import { getCategoryIcon } from "@/lib/category-icons";
import { EMPTY_FORM, SERVICE_TYPE_LABEL, buildCounterFields, parseShipping, validateCounterForm, type CounterFormValues, type FieldErrors } from "@/lib/counter-order";
import { fromPrice, modifiersPrice } from "@/lib/order-lines";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { ProductSheet, type SheetProduct } from "../../../tables/[id]/order/_components/product-sheet";
import { useActivePromotions, useCartPromoEstimate } from "../../../tables/[id]/order/_components/use-order-promos";
import { productPromoBadge, promotionsForChannel, roundCents, type LineEstimate } from "@/lib/promotions";
import type { PromotionChannel } from "@/types/promotions";
import { PromoChip, PromoPrice } from "../checkout/promo-line";
import type { PublicProduct, StaffCartItem } from "@/types/menu";
import { OrderDetailsForm } from "./order-details-form";

export type OrderKind = "dine_in" | "takeaway" | "table" | "delivery";

/** Counter service type each non-table kind is saved as. */
const KIND_SERVICE_TYPE = {
  dine_in: "dine_in_no_table",
  takeaway: "takeaway",
  delivery: "delivery",
} as const;

const KIND_META = {
  dine_in: { label: "Para comer aquí", icon: Coffee },
  takeaway: { label: "Para llevar", icon: ShoppingBag },
  table: { label: "Mesa", icon: UtensilsCrossed },
  delivery: { label: "Domicilio", icon: Bike },
} as const;

/**
 * Constructor de pedidos a pantalla completa (Caja). Carta con categorías a
 * la izquierda (pestañas arriba en teléfono), productos como tiles grandes
 * y el ticket SIEMPRE a la vista a la derecha (cajón inferior en teléfono).
 *
 * Reusa lo de siempre: el carrito del mesero (useStaffCart), la ficha de
 * variantes y extras (ProductSheet), createCounterOrder para llevar y
 * domicilio (con "cobrar después" = payLater) y addTicket para mesas.
 * Promociones (M13): estimado con las promos de hoy del canal del pedido
 * (pos.tables / pos.<tipo de servicio>); el total real lo calcula el servidor.
 */
export function OrderBuilder({
  kind,
  canCharge,
  onChangeKind,
  onClose,
  onChargeNow,
}: {
  kind: OrderKind;
  canCharge: boolean;
  onChangeKind: () => void;
  onClose: () => void;
  onChargeNow: (tableSessionId: string, label: string) => void;
}) {
  const router = useRouter();
  const cart = useStaffCart();
  const allPromos = useActivePromotions(null);
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [data, setData] = useState<OrderBuilderData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ product: SheetProduct; editing: StaffCartItem | null } | null>(null);
  const [form, setForm] = useState<CounterFormValues>(() => ({
    ...EMPTY_FORM,
    serviceType: kind === "table" ? "takeaway" : KIND_SERVICE_TYPE[kind],
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tableId, setTableId] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [saving, startSaving] = useTransition();
  const [pulse, setPulse] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getOrderBuilderData().then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setLoadError(r.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const lines = useMemo(
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
  const requestKey = useIdempotencyKey(JSON.stringify([kind, form, lines, tableId]));

  const categories = useMemo(
    () => (data?.categories ?? []).map((c) => ({ ...c, products: c.products.filter((p) => p.available) })).filter((c) => c.products.length > 0),
    [data]
  );
  const activeCategory = category ?? categories[0]?.id ?? null;
  const results = useMemo(() => {
    const term = normalizeText(query.trim());
    if (!term) return null;
    return categories.flatMap((c) => c.products).filter((p) => normalizeText(p.name).includes(term));
  }, [categories, query]);
  const visible = results ?? categories.find((c) => c.id === activeCategory)?.products ?? [];

  const own = kind === "delivery" && form.provider === "own";
  const ship = own ? parseShipping(form.shippingCost) : null;
  const shipAmount = ship === null || Number.isNaN(ship) ? 0 : ship;
  const channel: PromotionChannel =
    kind === "table" ? "pos.tables" : `pos.${form.serviceType || KIND_SERVICE_TYPE[kind]}`;
  const promos = useMemo(() => promotionsForChannel(allPromos, channel), [allPromos, channel]);
  const categoryOf = useMemo(
    () => new Map((data?.categories ?? []).flatMap((c) => c.products.map((p) => [p.id, c.id] as const))),
    [data]
  );
  const { byLine: estimates, discount: promoOff } = useCartPromoEstimate(cart.items, data?.details, categoryOf, promos);
  const total = roundCents(cart.total - promoOff + shipAmount);
  const table = data?.tables.find((t) => t.id === tableId) ?? null;

  function requestClose() {
    if (cart.items.length > 0) setConfirmExit(true);
    else onClose();
  }

  function addProduct(p: PublicProduct) {
    const detail = data?.details[p.id];
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
      setPulse(p.id);
      window.setTimeout(() => setPulse((cur) => (cur === p.id ? null : cur)), 260);
      return;
    }
    setSheet({ product: { id: p.id, name: p.name, description: p.description, price: p.price }, editing: null });
  }

  function validate(): boolean {
    const e: FieldErrors = kind === "table" ? {} : validateCounterForm(form);
    if (kind === "table" && !tableId) e.table = "Elige la mesa";
    if (cart.items.length === 0) e.products = "Agrega al menos un producto";
    setErrors(e);
    const ok = Object.values(e).every((m) => !m);
    if (!ok && !isWide) setTicketOpen(true);
    return ok;
  }

  function saveCounter(payLater: boolean) {
    if (!validate()) return;
    startSaving(async () => {
      const fields = buildCounterFields(form);
      const r = await createCounterOrder({ ...fields, items: lines, payLater, clientRequestId: requestKey.get() });
      if (!r.ok) {
        if (r.field) setErrors((e) => ({ ...e, [r.field as string]: r.error }));
        notify.error(r.error);
        return;
      }
      requestKey.renew();
      const label = `${SERVICE_TYPE_LABEL[fields.serviceType]} #${r.data.counter_number}`;
      notify.success(payLater ? `${label} · en cocina, por cobrar` : `${label} · en cocina`);
      router.refresh();
      if (!payLater) onChargeNow(r.data.table_session_id, label);
      else onClose();
    });
  }

  function sendTable() {
    if (!validate() || !tableId) return;
    startSaving(async () => {
      const target = await getTableOrderTarget(tableId);
      if (!target.ok) {
        notify.error(target.error);
        return;
      }
      const r = await addTicket({ orderId: target.data.orderId, tableId, items: lines, requestId: requestKey.get() });
      if (!r.ok) {
        notify.error(r.error);
        return;
      }
      requestKey.renew();
      notify.success(`${table?.name ?? `Mesa ${table?.number ?? ""}`} · comanda #${r.data.ticketNumber} en cocina`);
      router.refresh();
      onClose();
    });
  }

  const KindIcon = KIND_META[kind].icon;
  const ticket = (
    <TicketPane
      kind={kind}
      items={cart.items}
      total={total}
      estimates={estimates}
      promoOff={promoOff}
      shipAmount={shipAmount}
      shippingPending={own && ship === null}
      form={form}
      errors={errors}
      tables={data?.tables ?? []}
      tableId={tableId}
      canCharge={canCharge}
      saving={saving}
      onTable={(id) => {
        setTableId(id);
        setErrors((e) => ({ ...e, table: undefined }));
      }}
      onForm={(key, value) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors({});
      }}
      onQty={cart.setQuantity}
      onRemove={cart.remove}
      onEdit={(item) =>
        setSheet({
          product: {
            id: item.productId,
            name: item.name,
            price: item.price - modifiersPrice(data?.details[item.productId]?.groups ?? [], item.selections ?? {}),
          },
          editing: item,
        })
      }
      onChargeNow={() => saveCounter(false)}
      onChargeLater={() => saveCounter(true)}
      onSendTable={sendTable}
    />
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Nuevo pedido · ${KIND_META[kind].label}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !sheet && !ticketOpen && !confirmExit) {
          e.stopPropagation();
          requestClose();
        }
      }}
      className="fixed inset-0 z-50 flex flex-col bg-background outline-none animate-pos-step motion-reduce:animate-none"
    >
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 md:px-4">
        <button
          type="button"
          onClick={requestClose}
          className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button px-3 text-body font-semibold text-foreground hover:bg-muted")}
        >
          <ArrowLeft className="size-5" aria-hidden /> <span className="max-sm:sr-only">Salir</span>
        </button>
        <button
          type="button"
          onClick={onChangeKind}
          className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-body-sm font-semibold text-foreground")}
          aria-label={`Tipo: ${KIND_META[kind].label}. Cambiar tipo`}
        >
          <KindIcon className="size-4" aria-hidden /> {KIND_META[kind].label}
          <span className="text-muted-foreground">· cambiar</span>
        </button>
        <div className="relative ml-auto w-full max-w-sm">
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
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[11rem_minmax(0,1fr)_22rem] xl:grid-cols-[13rem_minmax(0,1fr)_24rem]">
        {/* Categorías: rail vertical en tablet, pestañas con scroll en teléfono */}
        <nav aria-label="Categorías" className="border-b border-border bg-card lg:overflow-y-auto lg:border-r lg:border-b-0">
          <ul className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:px-2 lg:py-3">
            {categories.map((c) => {
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
                    <span aria-hidden className="text-lead leading-none">{getCategoryIcon(c.name)}</span>
                    <span className="whitespace-nowrap lg:truncate lg:whitespace-normal">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-label="Productos" className="min-h-0 overflow-y-auto overscroll-contain p-3 pb-28 md:p-4 lg:pb-4">
          {!data && !loadError && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-card bg-secondary" />
              ))}
            </div>
          )}
          {loadError && (
            <p role="alert" className="rounded-card bg-money-out-soft p-4 text-body-sm text-money-out-soft-foreground">
              {loadError}
            </p>
          )}
          {results && <p className="mb-3 text-meta text-muted-foreground">{results.length} resultado(s) para “{query}”</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const inCart = cart.quantityOf(p.id);
              const { price, hasChoice } = fromPrice(p.price, data?.details[p.id]?.variants);
              const hasExtras = (data?.details[p.id]?.groups.length ?? 0) > 0;
              const badge = productPromoBadge(p.id, categoryOf.get(p.id), price, promos);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    aria-label={`${p.name}, ${hasChoice ? "desde " : ""}${formatPrice(price)}${inCart ? `, ${inCart} en el pedido` : ""}`}
                    className={cn(
                      posPressable,
                      "relative flex h-full min-h-28 w-full flex-col justify-between gap-2 rounded-card border-2 bg-card p-3 text-left",
                      inCart > 0 ? "border-money-in-border" : "border-transparent shadow-sm hover:border-border",
                      pulse === p.id && "scale-[0.97]"
                    )}
                  >
                    <span className="line-clamp-3 text-body font-semibold leading-snug text-foreground">{p.name}</span>
                    {badge && (
                      <span className="flex flex-wrap gap-1">
                        {badge.labels.map((l) => (
                          <PromoChip key={l} label={l} />
                        ))}
                      </span>
                    )}
                    <span className="flex items-end justify-between gap-2">
                      {badge?.netPrice != null ? (
                        <PromoPrice list={price} net={badge.netPrice} className="justify-start text-body-sm" />
                      ) : (
                        <span className="text-body-sm font-semibold tabular-nums text-muted-foreground">
                          {hasChoice ? "Desde " : ""}
                          {formatPrice(price)}
                        </span>
                      )}
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
        </section>

        <aside aria-label="Pedido" className="hidden min-h-0 border-l border-border bg-card lg:flex lg:flex-col">
          {ticket}
        </aside>
      </div>

      {/* Teléfono: barra con el total que abre el ticket */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className={cn(posPressable, "flex min-h-14 w-full items-center justify-between rounded-button px-5 text-lead font-semibold", toneSolid.neutral)}
        >
          <span>Ver pedido · {cart.count} {cart.count === 1 ? "producto" : "productos"}</span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </button>
      </div>

      {!isWide && (
        <Sheet open={ticketOpen} onOpenChange={setTicketOpen}>
          <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-0 rounded-t-3xl p-0">
            <SheetTitle className="sr-only">Pedido</SheetTitle>
            <SheetDescription className="sr-only">Productos, datos del cliente y acciones del pedido.</SheetDescription>
            {ticket}
          </SheetContent>
        </Sheet>
      )}

      {sheet && (
        <ProductSheet
          key={sheet.editing?.id ?? sheet.product.id}
          product={sheet.product}
          detail={data?.details[sheet.product.id]}
          initial={sheet.editing}
          onClose={() => setSheet(null)}
          onConfirm={(line) => {
            if (sheet.editing) cart.replaceLine(sheet.editing.id, line);
            else cart.addLine(line);
            setErrors((e) => ({ ...e, products: undefined }));
            setSheet(null);
          }}
        />
      )}

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin guardar el pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes {cart.count} {cart.count === 1 ? "producto" : "productos"} sin enviar. Si sales, se descartan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-12">Seguir armando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="min-h-12" onClick={onClose}>
              Descartar y salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TicketPane({
  kind,
  items,
  total,
  estimates,
  promoOff,
  shipAmount,
  shippingPending,
  form,
  errors,
  tables,
  tableId,
  canCharge,
  saving,
  onTable,
  onForm,
  onQty,
  onRemove,
  onEdit,
  onChargeNow,
  onChargeLater,
  onSendTable,
}: {
  kind: OrderKind;
  items: StaffCartItem[];
  total: number;
  /** Display estimate per cart line (M13); empty without promotions. */
  estimates: Map<string, LineEstimate>;
  promoOff: number;
  shipAmount: number;
  shippingPending: boolean;
  form: CounterFormValues;
  errors: FieldErrors;
  tables: OrderBuilderData["tables"];
  tableId: string | null;
  canCharge: boolean;
  saving: boolean;
  onTable: (id: string) => void;
  onForm: <K extends keyof CounterFormValues>(key: K, value: CounterFormValues[K]) => void;
  onQty: (id: string, q: number) => void;
  onRemove: (id: string) => void;
  onEdit: (item: StaffCartItem) => void;
  onChargeNow: () => void;
  onChargeLater: () => void;
  onSendTable: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {kind === "table" ? (
          <section aria-labelledby="pick-table" className="mb-4">
            <h3 id="pick-table" className="mb-2 text-body font-semibold text-foreground">
              ¿Qué mesa?
            </h3>
            <div role="radiogroup" aria-label="Mesa" className="grid grid-cols-4 gap-2">
              {tables.map((t) => {
                const active = t.id === tableId;
                const busy = t.status !== "AVAILABLE";
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${t.name ?? `Mesa ${t.number}`}${busy ? ", ocupada" : ", libre"}`}
                    onClick={() => onTable(t.id)}
                    className={cn(
                      posPressable,
                      "flex min-h-14 flex-col items-center justify-center rounded-control border-2 text-body font-bold tabular-nums",
                      active ? "border-foreground bg-foreground text-background" : busy ? "border-attention-border bg-attention-soft text-attention-soft-foreground" : "border-border bg-card text-foreground"
                    )}
                  >
                    {t.number}
                    <span className="text-[0.65rem] font-medium">{busy ? "Ocupada" : "Libre"}</span>
                  </button>
                );
              })}
            </div>
            {errors.table && (
              <p role="alert" className="mt-1.5 text-body-sm font-medium text-money-out-soft-foreground">
                {errors.table}
              </p>
            )}
          </section>
        ) : (
          <OrderDetailsForm kind={kind === "delivery" ? "delivery" : "takeaway"} form={form} errors={errors} onChange={onForm} />
        )}

        <h3 className="mb-2 text-body font-semibold text-foreground">Pedido</h3>
        {items.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
            Toca un producto para agregarlo.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
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
                  {(estimates.get(item.id)?.discount ?? 0) > 0 ? (
                    <PromoPrice list={item.price * item.quantity} net={estimates.get(item.id)!.subtotal} className="shrink-0 flex-col items-end gap-0 text-body-sm" />
                  ) : (
                    <span className="shrink-0 text-body-sm font-semibold tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                  )}
                </div>
                {(estimates.get(item.id)?.labels.length ?? 0) > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {estimates.get(item.id)!.labels.map((l) => (
                      <PromoChip key={l} label={l} />
                    ))}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <QuantityStepper compact min={0} label={item.name} value={item.quantity} onChange={(q) => onQty(item.id, q)} />
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    aria-label={`Editar ${item.name}`}
                    className="ml-auto flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
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
        {errors.products && (
          <p role="alert" className="mt-1.5 text-body-sm font-medium text-money-out-soft-foreground">
            {errors.products}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {(shipAmount > 0 || shippingPending) && (
          <p className="flex justify-between text-body-sm text-muted-foreground">
            <span>Envío</span>
            <span className="tabular-nums">{shippingPending ? "Por cotizar" : formatPrice(shipAmount)}</span>
          </p>
        )}
        {promoOff > 0 && (
          <p className="flex items-center justify-between gap-2 text-body-sm text-attention-soft-foreground">
            <span className="flex items-center gap-1.5">
              <Tag className="size-3.5" aria-hidden /> Promociones
            </span>
            <span className="tabular-nums">−{formatPrice(promoOff)}</span>
          </p>
        )}
        <p className="flex items-baseline justify-between">
          <span className="text-body font-semibold text-foreground">{promoOff > 0 ? "Total estimado" : "Total"}</span>
          <span className="font-display text-title font-semibold tabular-nums text-foreground">{formatPrice(total)}</span>
        </p>
        {kind === "table" ? (
          <button
            type="button"
            disabled={saving}
            onClick={onSendTable}
            className={cn(posPressable, "flex min-h-14 items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md", toneSolid.neutral)}
          >
            {saving ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ChefHat className="size-5" aria-hidden />}
            Enviar a cocina
          </button>
        ) : (
          <>
            {canCharge && (
              <button
                type="button"
                disabled={saving}
                onClick={onChargeNow}
                className={cn(posPressable, "flex min-h-14 items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md", toneSolid["money-in"])}
              >
                {saving ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Wallet className="size-5" aria-hidden />}
                Cobrar ahora · <span className="tabular-nums">{formatPrice(total)}</span>
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={onChargeLater}
              className={cn(
                posPressable,
                "flex min-h-12 items-center justify-center gap-2 rounded-button border-2 border-border bg-card text-body font-semibold text-foreground hover:bg-muted"
              )}
            >
              <ChefHat className="size-5" aria-hidden /> Enviar a cocina · cobrar después
            </button>
          </>
        )}
      </div>
    </div>
  );
}
