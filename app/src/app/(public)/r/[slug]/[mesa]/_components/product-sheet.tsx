"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Minus, PencilLine, Plus, ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { cn, formatPrice } from "@/lib/utils";
import {
  bumpOption,
  groupError,
  modifierPicks,
  modifiersPrice,
  modifiersSummary,
  selectedCount,
  variantRequired,
} from "@/lib/order-lines";
import type {
  CustomerChoice,
  PublicProduct,
  StaffProductDetail,
} from "@/types/menu";

const EMPTY_DETAIL: StaffProductDetail = { variants: [], groups: [] };

/**
 * Detalle de producto.
 *
 * Tres decisiones que vienen de cómo se usa esto de verdad:
 *
 * 1. La cantidad y "Agregar" viven juntos en una barra fija abajo. Son
 *    las dos únicas cosas que el cliente viene a hacer, y en el sheet
 *    quedan en la zona del pulgar sin importar cuánto texto haya.
 * 2. Las observaciones arrancan plegadas detrás de un botón. Antes
 *    ocupaban el centro de la pantalla con un textarea siempre
 *    abierto: la mayoría no escribe nada y la ficha parecía un
 *    formulario que hay que llenar antes de poder pedir.
 * 3. Sin foto no se dibuja una banda alta y vacía — solo una franja
 *    fina con el emoji, para que el nombre del plato quede arriba del
 *    todo en vez de empujado por un hueco decorativo.
 */
export function ProductSheet({
  product,
  detail = EMPTY_DETAIL,
  onOpenChange,
  onAdd,
}: {
  product: PublicProduct | null;
  detail?: StaffProductDetail;
  onOpenChange: (open: boolean) => void;
  onAdd: (
    product: PublicProduct,
    quantity: number,
    notes: string,
    choice?: CustomerChoice
  ) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selections, setSelections] = useState<
    Record<string, Record<string, number>>
  >({});

  const required = variantRequired(detail);
  // Con una sola variante se usa sola (igual que la base).
  const effectiveVariantId =
    variantId ?? (detail.variants.length === 1 ? detail.variants[0].id : null);
  const variant = detail.variants.find((v) => v.id === effectiveVariantId);
  const groups = detail.groups;
  const unitPrice =
    (variant?.price ?? product?.price ?? 0) + modifiersPrice(groups, selections);
  const groupsInvalid = groups.some((g) =>
    groupError(g, selections[g.id] ?? {})
  );
  const blocked = (required && !variantId) || groupsInvalid;
  const hasChoices = detail.variants.length > 1 || groups.length > 0;

  // Reiniciar el formulario al abrir otro plato, comparando contra el
  // anterior DURANTE el render. Antes era un useEffect, que obliga a
  // pintar una vez con los datos del plato anterior y volver a pintar ya
  // corregido: dos renders y un parpadeo posible en cada toque. Llamando
  // a setState aquí, React descarta el render en curso y rehace este
  // componente antes de tocar la pantalla — un solo pintado. Es el
  // patrón que documenta React para "ajustar estado cuando cambia una
  // prop" (https://react.dev/learn/you-might-not-need-an-effect).
  const [lastProductId, setLastProductId] = useState(product?.id);
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id);
    setQuantity(1);
    setNotes("");
    setNotesOpen(false);
    setVariantId(null);
    setSelections({});
  }

  function handleAdd() {
    if (!product || blocked) return;
    onAdd(
      product,
      quantity,
      notes.trim(),
      hasChoices || detail.variants.length === 1
        ? {
            unitPrice,
            variantId: effectiveVariantId ?? undefined,
            variantName: variant?.name || undefined,
            modifiers: modifiersSummary(groups, selections) || undefined,
            modifierPicks: modifierPicks(groups, selections),
          }
        : undefined
    );
    onOpenChange(false);
  }

  return (
    <Sheet open={product !== null} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side="bottom"
        className="max-h-[92vh] gap-0 overflow-y-auto p-0"
        // No prevenir el foco del diálogo entero — eso rompía la trampa
        // de foco completa (Radix marca el fondo aria-hidden pero sin
        // `inert`, así que sin foco propio Tab seguía yendo a la carta
        // de atrás). El problema real que motivó esto era solo el
        // <Textarea> de notas tapado por el teclado al autofocar — ese
        // campo ni siquiera recibe foco al abrir el sheet (arranca
        // colapsado). Redirigir el foco al propio contenido, no a nada,
        // deja la trampa intacta sin reintroducir el problema original.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
      >
        {product && (
          <>
            <SheetHeader className="gap-0 space-y-0 p-0 text-left">
              {/* Sin foto no se dibuja el marco. Un rectángulo de
                  200px con un emoji al 22% no es "un placeholder
                  elegante": es un hueco que empuja el nombre del plato
                  fuera de la primera pantalla para no decir nada. */}
              {product.image_url && (
                <div className="px-5 pt-5">
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-muted">
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 600px"
                      // Sin `priority`: este panel solo existe después
                      // de que el cliente toca un plato. Marcarlo como
                      // prioritario lo ponía a competir por ancho de
                      // banda con la carta que sí se está viendo.
                      className="object-cover"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 px-5 pt-6">
                <SheetTitle className="font-display text-[30px] font-bold leading-[1.05]">
                  {product.name}
                </SheetTitle>
                {product.description && (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                )}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
              {/* Filas etiquetadas: el cliente lee "Precio" y
                  "Cantidad" y sabe exactamente qué está mirando, sin
                  tener que deducirlo de la posición. */}
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-[15px] font-semibold text-foreground">
                  Precio
                </span>
                <span className="font-display text-[20px] font-bold tabular-nums text-wine">
                  {required && !variant ? "Desde " : ""}
                  {formatPrice(
                    required && !variant
                      ? Math.min(...detail.variants.map((v) => v.price))
                      : unitPrice
                  )}
                </span>
              </div>

              {detail.variants.length > 1 && (
                <fieldset>
                  <legend className="mb-2 text-[13px] font-semibold">
                    Variante <span className="text-wine">(obligatoria)</span>
                  </legend>
                  <div role="radiogroup" className="flex flex-col gap-2">
                    {detail.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={v.id === variantId}
                        onClick={() => setVariantId(v.id)}
                        className={cn(
                          "flex min-h-11 items-center justify-between rounded-2xl border px-3.5 text-left text-[15px]",
                          v.id === variantId
                            ? "border-primary bg-secondary font-semibold"
                            : "border-border bg-card"
                        )}
                      >
                        <span>{v.name || product.name}</span>
                        <span className="tabular-nums text-wine">
                          {formatPrice(v.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {groups.map((group) => {
                const sel = selections[group.id] ?? {};
                const single = group.max_select === 1;
                const setGroup = (next: Record<string, number>) =>
                  setSelections((s) => ({ ...s, [group.id]: next }));
                return (
                  <fieldset key={group.id}>
                    <legend className="mb-2 text-[13px] font-semibold">
                      {group.name}{" "}
                      <span className="font-normal text-muted-foreground">
                        {group.min_select > 0
                          ? `(obligatorio) elige ${group.min_select === group.max_select ? group.min_select : `${group.min_select}–${group.max_select}`}`
                          : `hasta ${group.max_select}`}
                        {" · "}
                        {selectedCount(sel)}/{group.max_select}
                      </span>
                    </legend>
                    <ul className="flex flex-col gap-2">
                      {group.options.map((o) => {
                        const n = sel[o.id] ?? 0;
                        return (
                          <li key={o.id} className="flex items-center gap-2">
                            {single ? (
                              <button
                                type="button"
                                aria-pressed={n > 0}
                                onClick={() =>
                                  setGroup(
                                    n > 0 && group.min_select === 0
                                      ? {}
                                      : { [o.id]: 1 }
                                  )
                                }
                                className={cn(
                                  "flex min-h-11 flex-1 items-center justify-between rounded-2xl border px-3.5 text-left text-[15px]",
                                  n > 0
                                    ? "border-primary bg-secondary font-semibold"
                                    : "border-border bg-card"
                                )}
                              >
                                <span>{o.name}</span>
                                {o.price > 0 && (
                                  <span className="tabular-nums text-muted-foreground">
                                    +{formatPrice(o.price)}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <>
                                <span className="min-w-0 flex-1 truncate text-[15px]">
                                  {o.name}
                                </span>
                                {o.price > 0 && (
                                  <span className="tabular-nums text-muted-foreground">
                                    +{formatPrice(o.price)}
                                  </span>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-11 rounded-full"
                                  aria-label={`Quitar ${o.name}`}
                                  disabled={n === 0}
                                  onClick={() =>
                                    setGroup(bumpOption(group, sel, o.id, -1))
                                  }
                                >
                                  <Minus className="size-4" />
                                </Button>
                                <span className="w-5 text-center font-semibold tabular-nums">
                                  {n}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-11 rounded-full"
                                  aria-label={`Agregar ${o.name}`}
                                  disabled={
                                    selectedCount(sel) >= group.max_select ||
                                    (!group.allow_repeat && n >= 1)
                                  }
                                  onClick={() =>
                                    setGroup(bumpOption(group, sel, o.id, 1))
                                  }
                                >
                                  <Plus className="size-4" />
                                </Button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                );
              })}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-foreground">
                  Cantidad
                </span>
                <QuantityStepper value={quantity} onChange={setQuantity} />
              </div>

              {notesOpen ? (
                <div>
                  <label
                    htmlFor="notes"
                    className="mb-1.5 block text-[13px] font-semibold text-foreground"
                  >
                    Indicaciones para la cocina
                  </label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej: sin cebolla, término medio…"
                    rows={2}
                    autoFocus
                    className="rounded-2xl text-[15px]"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-dashed border-border px-3.5 text-left text-[13px] font-medium text-muted-foreground active:bg-secondary"
                  aria-label="Agregar indicaciones especiales para la cocina"
                >
                  <PencilLine className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {notes.trim() ? notes : "Agregar una indicación (opcional)"}
                </button>
              )}
            </div>

            {/* CTA fijo abajo: aunque la descripción sea larga, el
                botón queda siempre en la zona del pulgar. */}
            <div
              className="sticky bottom-0 border-t border-border/60 bg-card px-5 pt-3"
              style={{
                paddingBottom:
                  "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <Button
                size="lg"
                onClick={handleAdd}
                disabled={blocked}
                className={cn(
                  "clay clay-primary h-13 w-full justify-between rounded-2xl px-5 text-[15px]"
                )}
                aria-label={`Agregar ${quantity} ${product.name} al pedido - Total: ${formatPrice(unitPrice * quantity)}`}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" strokeWidth={2.25} />
                  Agregar al pedido
                </span>
                <span className="font-display text-[20px] font-bold tabular-nums">
                  {formatPrice(unitPrice * quantity)}
                </span>
              </Button>
              {blocked && (
                <p className="mt-2 text-center text-[12px] text-muted-foreground">
                  {required && !variantId
                    ? "Elige una variante para continuar."
                    : "Completa las opciones obligatorias."}
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
