"use client";

import { useState, useMemo, useTransition } from "react";
import {
  ChefHat,
  Info,
  Loader2,
  MessageCircle,
  PencilLine,
  Plus,
  QrCode,
  Receipt,
  Send,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { notify, isSessionExpiredMessage } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import { createOrder } from "@/lib/actions/orders";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { buildWhatsappUrl, composeOrderMessage } from "@/lib/whatsapp";
import type { CartItem, PublicProduct } from "@/types/menu";

export function CartSheet({
  open,
  onOpenChange,
  items,
  total,
  onUpdateQuantity,
  onClearCart,
  slug,
  tableNumber,
  orderingClosed = false,
  restaurantName,
  whatsappPhone,
  suggestedProducts,
  onAddSuggestion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  total: number;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onClearCart: () => void;
  slug: string;
  tableNumber: number | null;
  /** La cuenta ya se pidió: no se pueden agregar más productos. */
  orderingClosed?: boolean;
  restaurantName: string;
  whatsappPhone: string | null;
  suggestedProducts: PublicProduct[];
  onAddSuggestion: (product: PublicProduct) => void;
}) {
  const inTable = tableNumber !== null;

  // Bug P2 de QA 2026-09-26: si la mesa ya se cobró y liberó (o pasaron los
  // 90 min de sesión) `createOrder` devuelve el error de sesión expirada, el
  // toast lo muestra 6 s y desaparece — si el comensal no lo ve a tiempo se
  // queda con el carrito lleno sin ninguna pista. Este estado no se limpia
  // solo ni se pierde el carrito: solo se va si vuelve a escanear el QR
  // (lo que recarga la página entera y remonta este componente).
  const [sessionExpired, setSessionExpired] = useState(false);

  // Clave de idempotencia del envío: la misma mientras el carrito no cambie
  // (un reintento tras un corte de red no duplica el pedido), otra en cuanto
  // cambia el contenido o después de un envío exitoso.
  const orderLines = useMemo(
    () =>
      items.map((item) => ({
        productId: item.product.id,
        variantId: item.variantId,
        quantity: item.quantity,
        notes: item.notes || undefined,
        // Siempre un arreglo (aun vacío): así la base exige los grupos obligatorios.
        modifiers: item.modifierPicks ?? [],
      })),
    [items]
  );
  const requestKey = useIdempotencyKey(JSON.stringify(orderLines));

  const whatsappOrderUrl = useMemo(
    () =>
      open
        ? buildWhatsappUrl(
            whatsappPhone,
            composeOrderMessage(restaurantName, items, total)
          )
        : null,
    [open, whatsappPhone, restaurantName, items, total]
  );

  const cartProductIds = useMemo(
    () => new Set(items.map((item) => item.product.id)),
    [items]
  );
  const suggestionsToShow = suggestedProducts.filter(
    (p) => !cartProductIds.has(p.id)
  );

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  // Confirmations live INSIDE the panel (no dialog stacked over the sheet):
  // the first tap shows a review step in the footer, the second one sends.
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [sending, startSending] = useTransition();

  // Any change to the cart (or closing it) cancels a pending confirmation,
  // so "Enviar" never confirms a cart different from the one reviewed.
  const [reviewedKey, setReviewedKey] = useState(JSON.stringify(orderLines));
  const currentKey = JSON.stringify(orderLines);
  if (currentKey !== reviewedKey) {
    setReviewedKey(currentKey);
    setConfirmingSend(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmingSend(false);
      setConfirmingClear(false);
    }
    onOpenChange(next);
  }

  function sendOrder() {
    startSending(async () => {
      const result = await createOrder({
        items: orderLines,
        clientRequestId: requestKey.get(),
      });
      if (!result.ok) {
        notify.error(result.error);
        if (isSessionExpiredMessage(result.error)) setSessionExpired(true);
        setConfirmingSend(false);
        return;
      }
      requestKey.renew();
      notify.orderPlaced();
      onClearCart();
      onOpenChange(false);
      // Full navigation (not `router.push`) on purpose: the order just
      // created was never prefetched, so Next's client transition tries to
      // "resume" the generic PPR shell of /order/[id] against this real id
      // and the server throws `InvariantError: postponed state should not
      // be provided when fallback params are provided` (Next 16 + Cache
      // Components + dynamic routes without generateStaticParams,
      // vercel/next.js#98647). A full load skips that resume protocol.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see comment above: the full-navigation escape is intentional.
      window.location.assign(`/r/${slug}/${tableNumber}/order/${result.data}`);
    });
  }

  const sendBlocked = inTable && (sessionExpired || orderingClosed);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex data-[side=bottom]:h-[94dvh] max-h-[94dvh] flex-col gap-0 rounded-t-3xl bg-background p-0 sm:mx-auto sm:max-w-xl sm:border-x"
      >
        <div className="flex items-start gap-3 border-b border-border bg-card px-5 pb-4 pt-5 pr-16">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-display text-title-lg font-bold leading-tight">
              Mi pedido
            </SheetTitle>
            <SheetDescription className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
              {inTable ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-caption font-semibold text-foreground">
                  <UtensilsCrossed aria-hidden className="size-3.5" />
                  Mesa {tableNumber}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-caption font-semibold text-foreground">
                  <MessageCircle aria-hidden className="size-3.5" />
                  Por WhatsApp
                </span>
              )}
              <span>
                {itemCount} {itemCount === 1 ? "producto" : "productos"}
              </span>
            </SheetDescription>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card">
                <ShoppingBag aria-hidden className="size-8 text-primary" />
              </span>
              <div>
                <p className="font-display text-title-sm font-bold text-foreground">
                  Tu pedido está vacío
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Elige platos de la carta y aparecerán aquí.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="h-12 rounded-xl px-6 text-body"
              >
                Ver la carta
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-4 py-4">
              <section aria-label="Productos del pedido">
                <ul className="flex flex-col gap-2">
                  {items.map((item, index) => (
                    <li
                      key={`${item.product.id}-${index}`}
                      className="flex gap-3 rounded-2xl border border-border bg-card p-3"
                    >
                      <DishThumb product={item.product} size={64} />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="min-w-0">
                          <p className="font-display line-clamp-2 text-body font-bold leading-snug text-foreground">
                            {item.product.name}
                          </p>
                          {(item.variantName || item.modifiers) && (
                            <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">
                              {[item.variantName, item.modifiers].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {item.notes && (
                            <p className="mt-1 flex items-start gap-1 text-meta text-muted-foreground">
                              <PencilLine aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                              <span className="line-clamp-2">{item.notes}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display text-body-lg font-bold tabular-nums text-wine">
                            {formatPrice(item.subtotal)}
                          </p>
                          {/* Down to zero removes the dish, so no separate
                              "Quitar" button competes with the stepper. */}
                          <QuantityStepper
                            value={item.quantity}
                            min={0}
                            label={item.product.name}
                            onChange={(next) => onUpdateQuantity(index, next)}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {suggestionsToShow.length > 0 && (
                <section aria-labelledby="cart-more" className="flex flex-col gap-2.5">
                  <h3 id="cart-more" className="font-display px-1 text-body font-bold text-foreground">
                    Para acompañar
                  </h3>
                  <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1">
                    {suggestionsToShow.slice(0, 8).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => onAddSuggestion(product)}
                        aria-label={`Agregar ${product.name}, ${formatPrice(product.price)}`}
                        className="group flex w-[112px] shrink-0 snap-start flex-col gap-1.5 text-left"
                      >
                        <span className="relative">
                          <DishThumb product={product} size={112} />
                          <span
                            aria-hidden
                            className="absolute bottom-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-150 ease-out group-active:scale-90 motion-reduce:transition-none"
                          >
                            <Plus className="size-4" strokeWidth={3} />
                          </span>
                        </span>
                        <span className="line-clamp-2 text-body-sm font-semibold leading-snug text-foreground">
                          {product.name}
                        </span>
                        <span className="font-display text-body-sm font-bold tabular-nums text-wine">
                          {formatPrice(product.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Clearing the cart: an inline confirmation in place, not a
                  dialog over the sheet. */}
              <div className="flex justify-center">
                {confirmingClear ? (
                  <div
                    role="group"
                    aria-label="Confirmar vaciar el pedido"
                    className="flex w-full flex-col gap-3 rounded-2xl border border-money-out-border bg-money-out-soft p-4"
                  >
                    <p className="text-body-sm font-semibold text-money-out-soft-foreground">
                      ¿Vaciar el pedido? Se quitarán todos los platos que agregaste.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmingClear(false)}
                        className="h-12 rounded-xl bg-card text-body"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setConfirmingClear(false);
                          onClearCart();
                        }}
                        className="h-12 rounded-xl bg-money-out text-body text-money-out-foreground hover:bg-money-out/90"
                      >
                        Vaciar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmingClear(true)}
                    className="h-11 gap-1.5 rounded-xl px-4 text-body-sm font-semibold text-muted-foreground"
                  >
                    <Trash2 aria-hidden className="size-4" />
                    Vaciar el pedido
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div
            className="border-t border-border bg-card px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-body font-semibold text-muted-foreground">
                Total · {itemCount} {itemCount === 1 ? "producto" : "productos"}
              </span>
              <span className="font-display text-display font-bold tabular-nums text-foreground">
                {formatPrice(total)}
              </span>
            </div>

            {inTable && sessionExpired && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2.5 rounded-xl border border-money-out-border bg-money-out-soft px-4 py-3 text-body-sm text-money-out-soft-foreground"
              >
                <QrCode aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Tu sesión de mesa venció. Escanea el QR de tu mesa otra vez para enviar el
                  pedido — tu carrito sigue aquí.
                </span>
              </div>
            )}

            {inTable && orderingClosed && !sessionExpired && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2.5 rounded-xl border border-attention-border bg-attention-soft px-4 py-3 text-body-sm text-foreground"
              >
                <Receipt aria-hidden className="mt-0.5 size-4 shrink-0 text-attention-soft-foreground" />
                <span>
                  Ya pediste la cuenta, así que no se pueden agregar más productos. Si quieres
                  algo más, avísale al mesero.
                </span>
              </div>
            )}

            {inTable && confirmingSend && !sendBlocked && (
              <div
                role="group"
                aria-label="Confirmar envío"
                className="mb-3 flex items-start gap-2.5 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-body-sm text-foreground"
              >
                <ChefHat aria-hidden className="mt-0.5 size-4 shrink-0 text-info-soft-foreground" />
                <span>
                  <span className="font-semibold">¿Confirmar pedido?</span> Va a la Mesa{" "}
                  {tableNumber} por {formatPrice(total)}. Revísalo antes de enviarlo.
                </span>
              </div>
            )}

            {inTable ? (
              sendBlocked ? (
                <Button size="lg" disabled className="h-14 w-full rounded-2xl text-body-lg font-semibold">
                  Enviar pedido
                </Button>
              ) : confirmingSend ? (
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={sending}
                    onClick={() => setConfirmingSend(false)}
                    className="h-14 rounded-2xl text-body font-semibold"
                  >
                    Seguir editando
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    disabled={sending}
                    onClick={sendOrder}
                    className="clay clay-primary h-14 rounded-2xl text-body-lg font-semibold"
                  >
                    {sending ? (
                      <Loader2 aria-hidden className="size-5 animate-spin" />
                    ) : (
                      <Send aria-hidden className="size-5" />
                    )}
                    {sending ? "Enviando…" : "Sí, enviar"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  onClick={() => setConfirmingSend(true)}
                  className="clay clay-primary h-14 w-full rounded-2xl text-body-lg font-semibold"
                >
                  <Send aria-hidden className="size-5" />
                  Enviar pedido
                </Button>
              )
            ) : whatsappOrderUrl ? (
              <a
                href={whatsappOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="clay clay-primary flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-body-lg font-semibold text-primary-foreground"
              >
                <MessageCircle aria-hidden className="size-5" strokeWidth={2} />
                Pedir por WhatsApp
              </a>
            ) : (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-center text-body-sm text-muted-foreground">
                <Info aria-hidden className="size-4 shrink-0" />
                Este restaurante todavía no cargó su número de WhatsApp.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Square dish photo, or a soft tile with the plate emoji when it has none. */
function DishThumb({ product, size }: { product: PublicProduct; size: number }) {
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-xl bg-secondary"
      style={{ width: size, height: size }}
    >
      {product.image_url ? (
        <Image src={product.image_url} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span aria-hidden className="emoji-tile flex size-full items-center justify-center text-[1.75rem] leading-none">
          <span className="emoji-3d">🍽️</span>
        </span>
      )}
    </span>
  );
}
