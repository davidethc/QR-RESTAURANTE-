"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { EmptyState } from "@/components/shared/empty-state";
import { createCounterOrder, updateCounterOrder } from "@/lib/actions/counter-order";
import { notify } from "@/lib/notifications";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { useStaffCart } from "@/hooks/use-staff-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { modifiersPrice } from "@/lib/order-lines";
import {
  DELIVERY_PROVIDERS,
  EMPTY_FORM,
  PROVIDER_LABEL,
  SERVICE_TYPES,
  SERVICE_TYPE_HELP,
  SERVICE_TYPE_LABEL,
  buildCounterFields,
  parseShipping,
  validateCounterForm,
  type CounterFormValues,
  type CounterOrderView,
  type FieldErrors,
} from "@/lib/counter-order";
import { ProductList } from "../../tables/[id]/order/_components/staff-order-builder";
import { ProductSheet, type SheetProduct } from "../../tables/[id]/order/_components/product-sheet";
import { useChargeSheet } from "../../cash/_components/charge-sheet-host";
import type { PublicCategory, StaffCartItem, StaffProductDetail } from "@/types/menu";

type Step = "form" | "products" | "pay";

function formFromOrder(o: CounterOrderView): CounterFormValues {
  const a = o.deliveryAddress ?? {};
  return {
    serviceType: o.serviceType,
    customerName: o.customerName ?? "",
    customerPhone: o.customerPhone ?? "",
    provider: o.deliveryProvider ?? "",
    externalOrderId: o.externalOrderId ?? "",
    colonia: a.colonia ?? "",
    calle: a.calle ?? "",
    numero: a.numero ?? "",
    entreCalles: a.entre_calles ?? "",
    referencias: a.referencias ?? "",
    shippingCost: o.shippingCost === null ? "" : String(o.shippingCost),
    generalComment: o.generalComment ?? "",
  };
}

/**
 * Modal "Agrega un pedido" / "Editar pedido #N" (M06). Formulario a la
 * izquierda y vista previa del ticket a la derecha (escritorio). Al crear:
 * tipo -> productos (selector del mesero) -> paso de cobro con "Cobrar
 * después". Al editar solo cambian los datos del pedido (los productos se
 * editan por comanda).
 */
export function CounterOrderModal({
  open,
  onOpenChange,
  editing,
  categories,
  details,
  billingEnabled,
  canCharge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CounterOrderView | null;
  categories: PublicCategory[];
  details: Record<string, StaffProductDetail>;
  billingEnabled: boolean;
  canCharge: boolean;
}) {
  // Se remonta al abrir/cambiar de pedido: el estado inicial sale de props.
  if (!open) return null;
  return (
    <ModalBody
      key={editing?.id ?? "new"}
      onOpenChange={onOpenChange}
      editing={editing}
      categories={categories}
      details={details}
      billingEnabled={billingEnabled}
      canCharge={canCharge}
    />
  );
}

function ModalBody({
  onOpenChange,
  editing,
  categories,
  details,
  billingEnabled,
  canCharge,
}: {
  onOpenChange: (open: boolean) => void;
  editing: CounterOrderView | null;
  categories: PublicCategory[];
  details: Record<string, StaffProductDetail>;
  billingEnabled: boolean;
  canCharge: boolean;
}) {
  const router = useRouter();
  const { openCharge } = useChargeSheet();
  const cart = useStaffCart();
  const [form, setForm] = useState<CounterFormValues>(() => (editing ? formFromOrder(editing) : EMPTY_FORM));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [payLater, setPayLater] = useState(!billingEnabled || !canCharge);
  const [saving, startSaving] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ product: SheetProduct; editing: StaffCartItem | null } | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set());

  const isEdit = editing !== null;
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
  const requestKey = useIdempotencyKey(JSON.stringify([form, lines, payLater]));

  const own = form.serviceType === "delivery" && form.provider === "own";
  const platform = form.serviceType === "delivery" && form.provider !== "own" && form.provider !== "";
  const ship = own ? parseShipping(form.shippingCost) : null;
  const shipAmount = ship === null || Number.isNaN(ship) ? 0 : ship;
  const subtotal = isEdit ? editing.subtotal : cart.total;
  const total = subtotal + shipAmount;

  function set<K extends keyof CounterFormValues>(key: K, value: CounterFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    const fieldKey = FORM_TO_FIELD[key];
    if (fieldKey && errors[fieldKey]) setErrors((e) => ({ ...e, [fieldKey]: undefined }));
  }

  function validate(): boolean {
    const e = validateCounterForm(form);
    if (!isEdit && cart.items.length === 0 && !e.service_type) e.products = "Agrega al menos un producto";
    setErrors(e);
    return Object.values(e).every((m) => !m);
  }

  function handleContinue() {
    setFormError(null);
    if (!validate()) return;
    if (isEdit) {
      save(false);
      return;
    }
    setStep("pay");
  }

  function applyFailure(result: { error: string; field?: string; code?: string }) {
    if (result.code === "CONFIRM_REQUIRED") {
      setConfirm(result.error);
      return;
    }
    if (result.field) {
      setErrors((e) => ({ ...e, [result.field as string]: result.error }));
      setStep("form");
    } else {
      setFormError(result.error);
    }
    notify.error(result.error);
  }

  function save(confirmIncrease: boolean) {
    startSaving(async () => {
      const f = buildCounterFields(form);
      if (isEdit) {
        const result = await updateCounterOrder({
          orderId: editing.id,
          changes: {
            service_type: f.serviceType,
            delivery_provider: f.deliveryProvider ?? null,
            external_order_id: f.externalOrderId ?? null,
            customer_name: f.customerName ?? null,
            customer_phone: f.customerPhone ?? null,
            delivery_address: f.deliveryAddress ?? null,
            shipping_cost: f.shippingCost ?? null,
            general_comment: f.generalComment ?? null,
          },
          confirmTotalIncrease: confirmIncrease,
        });
        if (!result.ok) return applyFailure(result);
        notify.success("Pedido actualizado");
        onOpenChange(false);
        router.refresh();
        return;
      }
      const result = await createCounterOrder({
        ...f,
        items: lines,
        payLater,
        clientRequestId: requestKey.get(),
      });
      if (!result.ok) return applyFailure(result);
      requestKey.renew();
      notify.success(payLater ? "Pedido guardado sin cobrar" : "Pedido guardado");
      onOpenChange(false);
      router.refresh();
      if (!payLater && result.data.bill_id) {
        openCharge({
          tableSessionId: result.data.table_session_id,
          tableLabel: `${SERVICE_TYPE_LABEL[f.serviceType]} #${result.data.counter_number}`,
        });
      }
    });
  }

  const results = useMemo(() => {
    const term = normalizeText(query.trim());
    if (!term) return null;
    return categories.flatMap((c) => c.products).filter((p) => p.available && normalizeText(p.name).includes(term));
  }, [categories, query]);

  const title = isEdit ? `Editar pedido #${editing.folio}` : "Agrega un pedido";

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-full flex-col gap-0 p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-title-sm">{title}</DialogTitle>
            <DialogDescription>
              {step === "products"
                ? "Elige los productos del pedido."
                : step === "pay"
                  ? "Cobrar al cliente"
                  : "Elige el tipo de pedido y completa sus datos."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1fr_320px] lg:overflow-hidden">
            <div className="min-h-0 overflow-y-auto px-4 py-4">
              {step === "form" && (
                <div className="flex flex-col gap-5">
                  <div>
                    <Label className="mb-2 block text-body-sm font-semibold">Tipo de pedido</Label>
                    <div role="radiogroup" aria-label="Tipo de pedido" aria-invalid={!!errors.service_type} className="grid gap-2 sm:grid-cols-3">
                      {SERVICE_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={form.serviceType === t}
                          onClick={() => set("serviceType", t)}
                          className={cn(
                            "flex min-h-14 flex-col items-start justify-center rounded-control border bg-card p-3 text-left transition-colors",
                            form.serviceType === t ? "border-primary bg-primary-soft" : "border-border",
                            errors.service_type && "border-destructive"
                          )}
                        >
                          <span className="text-body font-semibold">{SERVICE_TYPE_LABEL[t]}</span>
                          <span className="text-meta text-muted-foreground">{SERVICE_TYPE_HELP[t]}</span>
                        </button>
                      ))}
                    </div>
                    <FieldMsg message={errors.service_type} />
                  </div>

                  {(form.serviceType === "dine_in_no_table" || form.serviceType === "takeaway") && (
                    <TextField
                      id="co-name"
                      label={form.serviceType === "takeaway" ? "Nombre de cliente" : "Nombre de cliente (opcional)"}
                      value={form.customerName}
                      onChange={(v) => set("customerName", v)}
                      error={errors.customer_name}
                      maxLength={80}
                      placeholder="Ej: Ana"
                    />
                  )}

                  {form.serviceType === "delivery" && (
                    <>
                      <div>
                        <Label className="mb-2 block text-body-sm font-semibold">Servicio de entrega</Label>
                        <div role="radiogroup" aria-label="Servicio de entrega" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {DELIVERY_PROVIDERS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              role="radio"
                              aria-checked={form.provider === p}
                              onClick={() => set("provider", p)}
                              className={cn(
                                "min-h-11 rounded-control border bg-card px-3 text-body-sm font-semibold",
                                form.provider === p ? "border-primary bg-primary-soft" : "border-border",
                                errors.delivery_provider && "border-destructive"
                              )}
                            >
                              {PROVIDER_LABEL[p]}
                            </button>
                          ))}
                        </div>
                        <FieldMsg message={errors.delivery_provider} />
                      </div>

                      {platform && (
                        <TextField
                          id="co-ext"
                          label="ID de pedido de la plataforma"
                          value={form.externalOrderId}
                          onChange={(v) => set("externalOrderId", v)}
                          error={errors.external_order_id}
                          maxLength={60}
                        />
                      )}

                      {own && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextField id="co-dname" label="Nombre" value={form.customerName} onChange={(v) => set("customerName", v)} error={errors.customer_name} maxLength={80} />
                          <TextField id="co-phone" label="Teléfono (con código de país)" inputMode="tel" value={form.customerPhone} onChange={(v) => set("customerPhone", v)} error={errors.customer_phone} maxLength={20} placeholder="+593 99 123 4567" />
                          <TextField id="co-colonia" label="Colonia" value={form.colonia} onChange={(v) => set("colonia", v)} error={errors["delivery_address.colonia"]} />
                          <TextField id="co-calle" label="Calle" value={form.calle} onChange={(v) => set("calle", v)} error={errors["delivery_address.calle"]} />
                          <TextField id="co-num" label="Número (casa, depto, edificio)" value={form.numero} onChange={(v) => set("numero", v)} error={errors["delivery_address.numero"]} />
                          <TextField id="co-entre" label="Entre calles" value={form.entreCalles} onChange={(v) => set("entreCalles", v)} error={errors["delivery_address.entre_calles"]} />
                          <div className="sm:col-span-2">
                            <TextField id="co-ref" label="Referencias" value={form.referencias} onChange={(v) => set("referencias", v)} error={errors["delivery_address.referencias"]} />
                          </div>
                          <TextField
                            id="co-ship"
                            label="Costo de envío (vacío = Por cotizar)"
                            inputMode="decimal"
                            value={form.shippingCost}
                            onChange={(v) => set("shippingCost", v)}
                            error={errors.shipping_cost}
                            placeholder="Por cotizar"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {form.serviceType && !isEdit && (
                    <div>
                      <Label className="mb-2 block text-body-sm font-semibold">Productos</Label>
                      {cart.items.length > 0 && (
                        <ul className="mb-2 space-y-2">
                          {cart.items.map((item) => (
                            <li key={item.id} className="rounded-control border border-border p-2">
                              <div className="flex items-center gap-2">
                                <QuantityStepper compact min={0} label={item.name} value={item.quantity} onChange={(q) => cart.setQuantity(item.id, q)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-body-sm font-medium">
                                    {item.name}
                                    {item.variantName ? ` · ${item.variantName}` : ""}
                                  </span>
                                  {item.modifiers && <span className="block text-meta text-muted-foreground">{item.modifiers}</span>}
                                  {item.notes && <span className="block truncate text-meta text-muted-foreground">{item.notes}</span>}
                                </span>
                                <span className="shrink-0 text-body-sm font-semibold tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                              </div>
                              <div className="mt-1 flex gap-1.5">
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
                                        price: item.price - modifiersPrice(details[item.productId]?.groups ?? [], item.selections ?? {}),
                                      },
                                      editing: item,
                                    })
                                  }
                                >
                                  <Pencil className="size-4" /> Editar
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="min-h-11 rounded-full text-destructive" onClick={() => cart.remove(item.id)}>
                                  <Trash2 className="size-4" /> Quitar
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button type="button" variant="outline" className="min-h-11 rounded-control" onClick={() => setStep("products")}>
                        <Package className="size-4" /> {cart.items.length ? "Editar productos…" : "Agregar productos…"}
                      </Button>
                      <FieldMsg message={errors.products} />
                    </div>
                  )}

                  {form.serviceType && (
                    <div>
                      <Label htmlFor="co-comment" className="mb-1.5 block text-body-sm font-semibold">
                        Comentario adicional (opcional)
                      </Label>
                      <Textarea
                        id="co-comment"
                        rows={2}
                        maxLength={300}
                        value={form.generalComment}
                        onChange={(e) => set("generalComment", e.target.value)}
                        aria-invalid={!!errors.general_comment}
                      />
                      <FieldMsg message={errors.general_comment} />
                    </div>
                  )}
                </div>
              )}

              {step === "products" && (
                <div className="-mx-4 -my-4">
                  <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
                    <div className="relative">
                      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar plato…" className="h-11 rounded-control pl-9 pr-9 text-body" />
                      {query && (
                        <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {results ? (
                    <section className="pt-4">
                      {results.length === 0 ? (
                        <EmptyState title="Sin resultados" description={`Ningún plato coincide con "${query}".`} />
                      ) : (
                        <ProductList products={results} onAdd={(p) => setSheet({ product: p, editing: null })} quantityOf={cart.quantityOf} details={details} />
                      )}
                    </section>
                  ) : (
                    categories.map((category) => {
                      const available = category.products.filter((p) => p.available);
                      if (available.length === 0) return null;
                      const isOpen = openCats.has(category.id);
                      return (
                        <section key={category.id}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() =>
                              setOpenCats((prev) => {
                                const next = new Set(prev);
                                if (next.has(category.id)) next.delete(category.id);
                                else next.add(category.id);
                                return next;
                              })
                            }
                            className="flex min-h-14 w-full items-center gap-3 border-t border-border px-4 py-3 text-left active:bg-muted"
                          >
                            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control bg-secondary text-title leading-none">
                              {getCategoryIcon(category.name)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-lead font-semibold">{category.name}</span>
                            <span className="shrink-0 text-meta tabular-nums text-muted-foreground">{available.length}</span>
                          </button>
                          {isOpen && (
                            <ProductList products={available} onAdd={(p) => setSheet({ product: p, editing: null })} quantityOf={cart.quantityOf} details={details} />
                          )}
                        </section>
                      );
                    })
                  )}
                </div>
              )}

              {step === "pay" && (
                <div className="flex flex-col gap-4">
                  <p className="text-title font-semibold tabular-nums">Cobrar al cliente: {formatPrice(total)}</p>
                  {own && form.shippingCost.trim() === "" && (
                    <p className="text-body-sm text-muted-foreground">El envío está por cotizar; no está incluido en este total.</p>
                  )}
                  <label htmlFor="co-paylater" className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border bg-card p-3">
                    <Checkbox
                      id="co-paylater"
                      checked={payLater}
                      disabled={!billingEnabled || !canCharge}
                      onCheckedChange={(c) => setPayLater(c === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-body font-semibold">Cobrar después</span>
                      <span className="block text-meta text-muted-foreground">
                        {billingEnabled && canCharge
                          ? "El pedido se guardará con pago pendiente."
                          : "El cobro no está disponible: el pedido se guarda con pago pendiente."}
                      </span>
                    </span>
                  </label>
                  {!payLater && (
                    <p className="text-body-sm text-muted-foreground">
                      Al guardar se abrirá la hoja de cobro para elegir caja y método de pago.
                    </p>
                  )}
                </div>
              )}

              {formError && (
                <p role="alert" className="mt-3 text-body-sm font-medium text-destructive">
                  {formError}
                </p>
              )}
            </div>

            <TicketPreview
              form={form}
              items={
                isEdit
                  ? editing.items.map((i) => ({ name: i.name, quantity: i.quantity, amount: i.subtotal }))
                  : cart.items.map((i) => ({ name: i.name, quantity: i.quantity, amount: i.price * i.quantity }))
              }
              subtotal={subtotal}
              total={total}
              showShipping={own}
              shippingPending={own && ship === null}
              shipAmount={shipAmount}
            />
          </div>

          <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-none border-t border-border px-4 py-3">
            {step === "form" && (
              <>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="button" className="min-h-11" disabled={saving} onClick={handleContinue}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {isEdit ? "Guardar cambios" : "Continuar"}
                </Button>
              </>
            )}
            {step === "products" && (
              <Button type="button" className="min-h-11" onClick={() => setStep("form")}>
                Listo · {cart.count} {cart.count === 1 ? "plato" : "platos"} · {formatPrice(cart.total)}
              </Button>
            )}
            {step === "pay" && (
              <>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setStep("form")}>
                  Atrás
                </Button>
                <Button type="button" className="min-h-11" disabled={saving} onClick={() => save(false)}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {payLater ? "Guardar sin cobrar" : `Cobrar ${formatPrice(total)}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            setErrors((e) => ({ ...e, products: undefined }));
            setSheet(null);
          }}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El total del pedido va a subir</AlertDialogTitle>
            <AlertDialogDescription>{confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => {
                setConfirm(null);
                save(true);
              }}
            >
              Confirmar cambio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Campo del formulario -> clave de error (nombre de campo de la RPC). */
const FORM_TO_FIELD: Partial<Record<keyof CounterFormValues, string>> = {
  serviceType: "service_type",
  customerName: "customer_name",
  customerPhone: "customer_phone",
  provider: "delivery_provider",
  externalOrderId: "external_order_id",
  colonia: "delivery_address.colonia",
  calle: "delivery_address.calle",
  numero: "delivery_address.numero",
  entreCalles: "delivery_address.entre_calles",
  referencias: "delivery_address.referencias",
  shippingCost: "shipping_cost",
  generalComment: "general_comment",
};

function FieldMsg({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-body-sm font-medium text-destructive">
      {message}
    </p>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
} & Omit<React.ComponentProps<"input">, "onChange" | "value" | "id">) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-body-sm font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className="h-11 rounded-control text-body"
        {...rest}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-body-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function TicketPreview({
  form,
  items,
  subtotal,
  total,
  showShipping,
  shippingPending,
  shipAmount,
}: {
  form: CounterFormValues;
  items: { name: string; quantity: number; amount: number }[];
  subtotal: number;
  total: number;
  showShipping: boolean;
  shippingPending: boolean;
  shipAmount: number;
}) {
  return (
    <aside aria-label="Vista previa del ticket" className="hidden border-l border-border bg-muted/40 p-4 lg:block lg:overflow-y-auto">
      <div className="rounded-card border border-border bg-card p-4 text-body-sm">
        <p className="text-body font-semibold">
          {form.serviceType ? SERVICE_TYPE_LABEL[form.serviceType] : "Tipo de pedido"}
        </p>
        {form.customerName.trim() && <p className="text-muted-foreground">{form.customerName.trim()}</p>}
        {form.serviceType === "delivery" && form.provider && form.provider !== "own" && form.externalOrderId.trim() && (
          <p className="text-muted-foreground">
            {PROVIDER_LABEL[form.provider]} · {form.externalOrderId.trim()}
          </p>
        )}
        <hr className="my-3 border-dashed border-border" />
        {items.length === 0 ? (
          <p className="text-muted-foreground">Sin productos</p>
        ) : (
          <ul className="space-y-1">
            {items.map((i, k) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {i.quantity} × {i.name}
                </span>
                <span className="tabular-nums">{formatPrice(i.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <hr className="my-3 border-dashed border-border" />
        <div className="flex justify-between">
          <span>Productos</span>
          <span className="tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        {showShipping && (
          <div className="flex justify-between">
            <span>Envío</span>
            <span className="tabular-nums">{shippingPending ? "Por cotizar" : formatPrice(shipAmount)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-body font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(total)}</span>
        </div>
        {form.generalComment.trim() && <p className="mt-3 text-muted-foreground">{form.generalComment.trim()}</p>}
      </div>
    </aside>
  );
}
