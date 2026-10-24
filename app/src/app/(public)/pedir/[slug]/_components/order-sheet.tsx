"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Bike,
  Check,
  Copy,
  CreditCard,
  Gift,
  Landmark,
  Loader2,
  LocateFixed,
  MapPin,
  ShoppingBag,
  Store,
  Trash2,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { ChoiceCards, type ChoiceOption } from "@/components/shared/choice-card";
import type { useCart } from "@/hooks/use-cart";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { placeOnlineOrder, quoteOnlineOrder } from "@/lib/actions/digital-menu";
import {
  PAYMENT_LABELS,
  SERVICE_LABELS,
  cartFingerprint,
  cartToOnlineItems,
  enabledMethods,
  parseMoneyInput,
} from "@/lib/digital-menu";
import { cn, formatPrice } from "@/lib/utils";
import type { DigitalMenu, OnlinePaymentMethod, OnlineQuote, OnlineServiceType } from "@/types/digital-menu";

type Cart = ReturnType<typeof useCart>;
type Step = "cart" | "details";
type Errors = Partial<Record<string, string>>;

/** Database `field=` hints and zod paths → the form's own field names. */
function formField(field: string | undefined): string {
  if (!field) return "form";
  const map: Record<string, string> = {
    customer_name: "customerName",
    customer_phone: "customerPhone",
    preferred_payment_method: "paymentMethod",
    pays_with_amount: "paysWithAmount",
    general_comment: "comment",
    delivery_address: "address",
    min_purchase: "form",
  };
  if (field.startsWith("delivery_address.")) return `address.${field.slice("delivery_address.".length)}`;
  return map[field] ?? field;
}

export function contactStorageKey(token: string) {
  return `mk_online_contact_${token}`;
}

const METHOD_ICONS = { cash: Banknote, card: CreditCard, transfer: Landmark } as const;

export function OrderSheet({
  open,
  onOpenChange,
  slug,
  mode,
  onModeChange,
  digital,
  cart,
  hiddenIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  mode: OnlineServiceType;
  onModeChange: (mode: OnlineServiceType) => void;
  digital: DigitalMenu;
  cart: Cart;
  hiddenIds: Set<string>;
}) {
  const router = useRouter();
  const accepting = digital.state.accepting_orders;
  const [step, setStep] = useState<Step>("cart");

  // ── Server quote (prices with promotions, shipping, minimum) ──
  const orderable = useMemo(() => cart.items.filter((i) => !hiddenIds.has(i.product.id)), [cart.items, hiddenIds]);
  const blockedLines = cart.items.length - orderable.length;
  const fingerprint = cartFingerprint(mode, orderable);
  const [quote, setQuote] = useState<{ fp: string; data?: OnlineQuote; error?: string } | null>(null);

  useEffect(() => {
    if (!open || orderable.length === 0) return;
    let stale = false;
    const t = setTimeout(async () => {
      const result = await quoteOnlineOrder({ slug, serviceType: mode, items: cartToOnlineItems(orderable) });
      if (stale) return;
      setQuote(result.ok ? { fp: fingerprint, data: result.data } : { fp: fingerprint, error: result.error });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // `fingerprint` already encodes mode + items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fingerprint, slug]);

  const current = quote?.fp === fingerprint ? quote : null;
  const q = current?.data;
  const quoting = orderable.length > 0 && !current;
  const minBlocked = Boolean(q?.min_purchase && !q.min_purchase.reached);

  // ── Customer form ──
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [calle, setCalle] = useState("");
  const [numero, setNumero] = useState("");
  const [colonia, setColonia] = useState("");
  const [entre, setEntre] = useState("");
  const [refs, setRefs] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [method, setMethod] = useState<OnlinePaymentMethod | null>(null);
  const [paysWith, setPaysWith] = useState("");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const channel = digital.payment_methods?.[mode];
  const methods = enabledMethods(channel);
  const activeMethod = method && methods.includes(method) ? method : null;

  const idem = useIdempotencyKey(
    JSON.stringify([fingerprint, name, phone, calle, numero, colonia, entre, refs, coords, activeMethod, paysWith, comment])
  );

  function locate() {
    if (!("geolocation" in navigator)) {
      setErrors((e) => ({ ...e, location: "Tu teléfono no permite compartir la ubicación." }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCoords({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setErrors((e) => ({ ...e, location: undefined }));
      },
      () => {
        setLocating(false);
        setErrors((e) => ({ ...e, location: "No pudimos obtener tu ubicación. Escribe la dirección y listo." }));
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  function submit() {
    setNotice(null);
    const next: Errors = {};
    if (!name.trim()) next.customerName = "Escribe tu nombre.";
    if (!phone.trim()) next.customerPhone = "Escribe tu teléfono.";
    if (mode === "delivery") {
      if (!calle.trim()) next["address.calle"] = "Escribe la calle.";
      if (!numero.trim()) next["address.numero"] = "Escribe el número.";
      if (!colonia.trim()) next["address.colonia"] = "Escribe el barrio o colonia.";
    }
    if (!activeMethod) next.paymentMethod = "Elige cómo vas a pagar para enviar tu pedido.";
    const pays = activeMethod === "cash" ? parseMoneyInput(paysWith) : null;
    if (pays !== null && (Number.isNaN(pays) || pays <= 0)) next.paysWithAmount = "Escribe un monto válido, por ejemplo 20.";
    else if (pays !== null && q && pays < q.subtotal) next.paysWithAmount = "El monto no cubre los productos.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !activeMethod) {
      // The footer button sits below the form: bring the first problem into view.
      requestAnimationFrame(() =>
        document.querySelector('[data-slot="sheet-content"] [role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" })
      );
      return;
    }

    const address =
      mode === "delivery"
        ? {
            calle: calle.trim(),
            numero: numero.trim(),
            colonia: colonia.trim(),
            ...(entre.trim() ? { entre_calles: entre.trim() } : {}),
            ...(refs.trim() ? { referencias: refs.trim() } : {}),
            ...(coords ?? {}),
          }
        : undefined;

    startTransition(async () => {
      const result = await placeOnlineOrder({
        slug,
        serviceType: mode,
        items: cartToOnlineItems(orderable),
        clientRequestId: idem.get(),
        customerName: name,
        customerPhone: phone,
        paymentMethod: activeMethod,
        address,
        paysWithAmount: pays ?? undefined,
        comment: comment || undefined,
      });
      if (!result.ok) {
        if (result.code?.startsWith("state:")) {
          setNotice(result.error);
          router.refresh();
          return;
        }
        if (result.code?.startsWith("rate_limit:")) {
          setNotice(result.error);
          return;
        }
        const field = formField(result.field);
        if (field === "form" || field === "comment") {
          if (field === "comment") setStep("cart");
          setNotice(result.error);
        } else setErrors({ [field]: result.error });
        return;
      }
      try {
        window.sessionStorage.setItem(
          contactStorageKey(result.data.tracking_token),
          JSON.stringify({ phone: phone.trim(), address: address ?? null })
        );
      } catch {
        // The WhatsApp text just goes without phone/address.
      }
      idem.renew();
      cart.clearCart();
      router.push(`/pedir/${slug}/pedido/${result.data.tracking_token}`);
    });
  }

  const canContinue = accepting && orderable.length > 0 && blockedLines === 0 && Boolean(q) && !minBlocked;

  const methodOptions: ChoiceOption<OnlinePaymentMethod>[] = methods.map((m) => ({
    value: m,
    title: PAYMENT_LABELS[m],
    icon: METHOD_ICONS[m],
    tone: m === "cash" ? "money-in" : "info",
  }));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setStep("cart");
      }}
    >
      <SheetContent
        side="bottom"
        className="flex data-[side=bottom]:h-[94dvh] max-h-[94dvh] flex-col gap-0 rounded-t-3xl bg-background p-0 sm:mx-auto sm:max-w-xl sm:border-x"
      >
        <div className="flex items-center gap-2 border-b border-border bg-card px-4 pb-4 pt-5 pr-16">
          {step === "details" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setStep("cart")}
              aria-label="Volver a tu pedido"
              className="size-11 rounded-xl"
            >
              <ArrowLeft aria-hidden className="size-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-display text-title-lg font-bold leading-tight">
              {step === "cart" ? "Tu pedido" : "Tus datos"}
            </SheetTitle>
            <SheetDescription className="mt-0.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
              {mode === "delivery" ? <Bike aria-hidden className="size-4" /> : <Store aria-hidden className="size-4" />}
              {SERVICE_LABELS[mode]}
              {step === "cart" && (
                <button
                  type="button"
                  onClick={() => onModeChange(mode === "delivery" ? "pickup" : "delivery")}
                  className="ml-1 min-h-8 rounded-md px-1 font-semibold text-primary underline underline-offset-2"
                >
                  Cambiar a {SERVICE_LABELS[mode === "delivery" ? "pickup" : "delivery"].toLowerCase()}
                </button>
              )}
            </SheetDescription>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <ShoppingBag aria-hidden className="size-8 text-primary" />
              <p className="font-display text-title-sm font-bold">Tu pedido está vacío</p>
              <Button type="button" variant="outline" className="h-12 rounded-xl px-6" onClick={() => onOpenChange(false)}>
                Ver el menú
              </Button>
            </div>
          ) : step === "cart" ? (
            <div className="flex flex-col gap-4 px-4 py-4">
              <section aria-label="Productos" className="overflow-hidden rounded-2xl border border-border bg-card">
                <ul className="flex flex-col divide-y divide-border">
                  {cart.items.map((item, index) => {
                    const hidden = hiddenIds.has(item.product.id);
                    const lineIndex = orderable.indexOf(item);
                    const line = !hidden && q ? q.lines[lineIndex] : undefined;
                    return (
                      <li key={`${item.product.id}-${index}`} className="flex flex-col gap-3 px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-body-lg font-bold leading-snug">
                              {item.product.name}
                              {item.variantName ? ` · ${item.variantName}` : ""}
                            </p>
                            {item.modifiers && <p className="mt-0.5 text-meta text-muted-foreground">{item.modifiers}</p>}
                            {item.notes && <p className="mt-0.5 text-meta text-muted-foreground">Nota: {item.notes}</p>}
                            {line && line.promotions.length > 0 && (
                              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-money-in-border bg-money-in-soft px-2 py-0.5 text-caption font-semibold text-money-in-soft-foreground">
                                <Gift aria-hidden className="size-3.5" />
                                {line.promotions.map((p) => p.label).join(" + ")}
                              </p>
                            )}
                            {hidden && (
                              <p className="mt-1 flex items-center gap-1 text-meta font-semibold text-money-out-soft-foreground">
                                <AlertTriangle aria-hidden className="size-3.5" />
                                No disponible {mode === "delivery" ? "a domicilio" : "para recoger"}. Quítalo para seguir.
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            {line && line.promo_discount > 0 && (
                              <p className="text-meta tabular-nums text-muted-foreground line-through">
                                {formatPrice(line.list_subtotal)}
                              </p>
                            )}
                            <p className="font-display text-body-lg font-bold tabular-nums text-wine">
                              {formatPrice(line ? line.subtotal : item.subtotal)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <QuantityStepper
                            value={item.quantity}
                            min={0}
                            label={item.product.name}
                            onChange={(next) => cart.updateQuantity(index, next)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => cart.removeItem(index)}
                            aria-label={`Quitar ${item.product.name}`}
                            className="h-11 gap-1.5 rounded-xl px-3 text-body-sm font-semibold text-money-out-soft-foreground hover:bg-money-out-soft"
                          >
                            <Trash2 aria-hidden className="size-4" />
                            Quitar
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <label className="flex flex-col gap-1.5">
                <span className="text-body-sm font-semibold">Comentarios para el restaurante (opcional)</span>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Ej.: tocar el timbre, sin cubiertos"
                  className="rounded-xl bg-card text-body"
                />
              </label>

              <Summary quote={q} mode={mode} quoting={quoting} error={current?.error} />
              {notice && <Notice text={notice} />}
            </div>
          ) : (
            <form
              className="flex flex-col gap-4 px-4 py-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              noValidate
            >
              <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <legend className="sr-only">Contacto</legend>
                <Field label="Nombre" error={errors.customerName}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} className="h-12 rounded-xl" />
                </Field>
                <Field label="Teléfono" error={errors.customerPhone} help="Te escribimos aquí si hay alguna duda.">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" className="h-12 rounded-xl" />
                </Field>
              </fieldset>

              {mode === "delivery" && (
                <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                  <legend className="float-left mb-1 flex w-full items-center gap-2 text-body font-semibold">
                    <MapPin aria-hidden className="size-4 text-primary" /> Dirección de entrega
                  </legend>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={coords ? () => setCoords(null) : locate}
                      disabled={locating}
                      className={cn("h-12 justify-start gap-2 rounded-xl", coords && "border-money-in-border bg-money-in-soft text-money-in-soft-foreground")}
                    >
                      {locating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : coords ? <Check aria-hidden className="size-4" /> : <LocateFixed aria-hidden className="size-4" />}
                      {coords ? "Ubicación agregada · tocar para quitar" : "Compartir mi ubicación (recomendado)"}
                    </Button>
                    <p className="text-meta text-muted-foreground">Con tu ubicación el repartidor llega más rápido.</p>
                    {errors.location && <p className="text-meta font-semibold text-money-out-soft-foreground">{errors.location}</p>}
                  </div>
                  <Field label="Barrio o colonia" error={errors["address.colonia"]}>
                    <Input value={colonia} onChange={(e) => setColonia(e.target.value)} maxLength={200} className="h-12 rounded-xl" />
                  </Field>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                    <Field label="Calle" error={errors["address.calle"]}>
                      <Input value={calle} onChange={(e) => setCalle(e.target.value)} autoComplete="address-line1" maxLength={200} className="h-12 rounded-xl" />
                    </Field>
                    <Field label="Número" error={errors["address.numero"]}>
                      <Input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={200} className="h-12 rounded-xl" />
                    </Field>
                  </div>
                  <Field label="Entre calles (opcional)" error={errors["address.entre_calles"]}>
                    <Input value={entre} onChange={(e) => setEntre(e.target.value)} maxLength={200} className="h-12 rounded-xl" />
                  </Field>
                  <Field label="Referencias (opcional)" error={errors["address.referencias"] ?? errors.address}>
                    <Input value={refs} onChange={(e) => setRefs(e.target.value)} maxLength={200} placeholder="Ej.: casa azul, portón negro" className="h-12 rounded-xl" />
                  </Field>
                </fieldset>
              )}

              <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <legend className="float-left mb-1 w-full text-body font-semibold">¿Cómo vas a pagar?</legend>
                <ChoiceCards<OnlinePaymentMethod>
                  label="Método de pago"
                  options={methodOptions}
                  value={activeMethod}
                  onChange={(m) => {
                    setMethod(m);
                    setErrors((e) => ({ ...e, paymentMethod: undefined }));
                  }}
                  columns={methods.length >= 3 ? 3 : 2}
                  size="md"
                />
                {errors.paymentMethod && (
                  <p role="alert" className="flex items-center gap-1.5 text-body-sm font-semibold text-money-out-soft-foreground">
                    <AlertTriangle aria-hidden className="size-4" /> {errors.paymentMethod}
                  </p>
                )}
                {activeMethod === "cash" && (
                  <Field label="¿Con cuánto pagarás? (opcional)" error={errors.paysWithAmount} help="Así llevamos el cambio exacto.">
                    <Input value={paysWith} onChange={(e) => setPaysWith(e.target.value)} inputMode="decimal" placeholder="Ej.: 20" className="h-12 rounded-xl" />
                  </Field>
                )}
                {activeMethod === "transfer" && channel?.bank && <BankDetails bank={channel.bank} />}
              </fieldset>

              <Summary quote={q} mode={mode} quoting={quoting} error={current?.error} />
              {notice && <Notice text={notice} />}
              <p className="px-1 text-caption leading-snug text-muted-foreground">
                Al enviar tu pedido aceptas los términos y condiciones del restaurante y el uso de tus datos para
                prepararlo y entregarlo. Después podrás enviarlo también por WhatsApp.
              </p>
              <button type="submit" className="sr-only">Enviar pedido</button>
            </form>
          )}
        </div>

        {cart.items.length > 0 && (
          <div
            className="border-t border-border bg-card px-4 pt-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {step === "cart" ? (
              <Button
                type="button"
                size="lg"
                disabled={!canContinue}
                onClick={() => setStep("details")}
                className="clay clay-primary h-14 w-full rounded-2xl text-body-lg font-semibold"
              >
                {!accepting
                  ? "Pedidos cerrados por ahora"
                  : quoting
                    ? "Calculando…"
                    : minBlocked
                      ? `Te faltan ${formatPrice(q?.min_purchase?.remaining ?? 0)} para el mínimo`
                      : "Continuar"}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                disabled={pending || !canContinue}
                onClick={submit}
                className="clay clay-primary h-14 w-full justify-between rounded-2xl px-5 text-body-lg font-semibold"
              >
                <span className="flex items-center gap-2">
                  {pending && <Loader2 aria-hidden className="size-5 animate-spin" />}
                  {pending ? "Enviando…" : "Enviar pedido"}
                </span>
                {q && (
                  <span className="font-display tabular-nums">
                    {formatPrice(q.subtotal)}
                    {q.shipping.pending ? " + envío" : ""}
                  </span>
                )}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  error,
  help,
  children,
}: {
  label: string;
  error?: string;
  help?: string;
  children: React.ReactElement<{ "aria-invalid"?: boolean }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-body-sm font-semibold text-foreground">{label}</span>
        {children}
      </label>
      {error ? (
        <span role="alert" className="text-meta font-semibold text-money-out-soft-foreground">{error}</span>
      ) : (
        help && <span className="text-meta text-muted-foreground">{help}</span>
      )}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-2xl border border-attention-border bg-attention-soft px-4 py-3">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-attention-soft-foreground" />
      <p className="text-body-sm text-foreground">{text}</p>
    </div>
  );
}

function Summary({
  quote,
  mode,
  quoting,
  error,
}: {
  quote: OnlineQuote | undefined;
  mode: OnlineServiceType;
  quoting: boolean;
  error?: string;
}) {
  if (error) return <Notice text={error} />;
  if (!quote) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-5 text-body-sm text-muted-foreground">
        {quoting && <Loader2 aria-hidden className="size-4 animate-spin" />} Calculando tu total…
      </div>
    );
  }
  const list = quote.subtotal + quote.promo_discount_total;
  return (
    <section aria-label="Resumen" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <dl className="flex flex-col gap-1.5 text-body">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Productos</dt>
          <dd className="tabular-nums">{formatPrice(list)}</dd>
        </div>
        {quote.promo_discount_total > 0 && (
          <div className="flex justify-between gap-3 text-money-in-soft-foreground">
            <dt className="flex items-center gap-1.5"><Gift aria-hidden className="size-4" /> Promociones</dt>
            <dd className="tabular-nums">−{formatPrice(quote.promo_discount_total)}</dd>
          </div>
        )}
        {mode === "delivery" && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Envío</dt>
            <dd className={cn(quote.shipping.free && "font-semibold text-money-in-soft-foreground")}>
              {quote.shipping.free ? "Gratis" : "Por cotizar"}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-border pt-2 font-display text-title-sm font-bold">
          <dt>Total</dt>
          <dd className="tabular-nums">
            {formatPrice(quote.subtotal)}
            {quote.shipping.pending && <span className="text-body font-semibold text-muted-foreground"> + envío</span>}
          </dd>
        </div>
      </dl>
      {quote.shipping.pending && (
        <p className="text-meta text-muted-foreground">El restaurante te confirma el costo del envío antes de prepararlo.</p>
      )}
      {quote.free_shipping && !quote.free_shipping.reached && (
        <p className="flex items-center gap-2 rounded-xl border border-info-border bg-info-soft px-3 py-2 text-body-sm text-info-soft-foreground">
          <Bike aria-hidden className="size-4 shrink-0" />
          Agrega {formatPrice(quote.free_shipping.remaining)} más y el envío es gratis.
        </p>
      )}
      {quote.min_purchase && !quote.min_purchase.reached && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-attention-border bg-attention-soft px-3 py-2 text-body-sm text-attention-soft-foreground">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          La compra mínima a domicilio es {formatPrice(quote.min_purchase.min_amount)}. Te faltan{" "}
          {formatPrice(quote.min_purchase.remaining)}.
        </p>
      )}
    </section>
  );
}

function BankDetails({ bank }: { bank: NonNullable<DigitalMenu["payment_methods"]>["delivery"]["bank"] }) {
  if (!bank) return null;
  const rows = [
    { label: "Titular", value: bank.holder },
    { label: "Banco", value: bank.bank },
    { label: "Cuenta", value: bank.account },
    { label: "Tarjeta", value: bank.card_number },
  ].filter((r): r is { label: string; value: string } => Boolean(r.value));
  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-info-border bg-info-soft">
      <p className="px-3 py-2 text-body-sm font-semibold text-info-soft-foreground">Datos para transferir</p>
      {rows.map((r) => (
        <CopyRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="truncate text-body font-semibold tabular-nums text-foreground select-all">{value}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-11 gap-1.5 rounded-xl px-3"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            // Long-press still selects the text (select-all).
          }
        }}
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
