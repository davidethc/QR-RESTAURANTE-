"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Check, CircleAlert, Minus, PencilLine, Plus, ShoppingBag } from "lucide-react";
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
        className="data-[side=bottom]:h-[94dvh] max-h-[94dvh] gap-0 overflow-y-auto rounded-t-3xl bg-background p-0 sm:mx-auto sm:max-w-xl sm:border-x"
        // Do not prevent focus on the whole dialog: that broke the focus
        // trap (Radix marks the background aria-hidden without `inert`).
        // Redirecting focus to the content itself keeps the trap intact
        // without auto-focusing the notes textarea under the keyboard.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
      >
        {product && (
          <>
            <SheetHeader className="gap-0 space-y-0 border-b border-border bg-card p-0 text-left">
              {/* Without a photo no frame is drawn: an empty 200px box
                  pushes the dish name out of the first screen for nothing. */}
              {product.image_url ? (
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 576px"
                    // No `priority`: this sheet only exists after a tap.
                    className="object-cover"
                  />
                </div>
              ) : (
                <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border" />
              )}

              <div className="flex flex-col gap-2 px-5 pb-5 pt-5 pr-14">
                <SheetTitle className="font-display text-display font-bold leading-tight text-balance">
                  {product.name}
                </SheetTitle>
                {product.description && (
                  <p className="text-body leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                )}
                <p className="font-display mt-1 text-title font-bold tabular-nums text-wine">
                  {required && !variant ? "Desde " : ""}
                  {formatPrice(
                    required && !variant
                      ? Math.min(...detail.variants.map((v) => v.price))
                      : unitPrice
                  )}
                </p>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-3 px-4 py-4">
              {detail.variants.length > 1 && (
                <fieldset className="rounded-2xl border border-border bg-card p-4">
                  <legend className="mb-3 w-full">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-body-lg font-semibold text-foreground">Variante</span>
                      <RequirementChip done={Boolean(variantId)} label="Obligatorio" />
                    </span>
                  </legend>
                  <div role="radiogroup" aria-label="Variante" className="flex flex-col gap-2">
                    {detail.variants.map((v) => {
                      const checked = v.id === variantId;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => setVariantId(v.id)}
                          className={cn(choiceClass, checked ? choiceOn : choiceOff)}
                        >
                          <ChoiceMark checked={checked} round />
                          <span className="min-w-0 flex-1">{v.name || product.name}</span>
                          <span className="tabular-nums font-semibold text-wine">
                            {formatPrice(v.price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {groups.map((group) => {
                const sel = selections[group.id] ?? {};
                const single = group.max_select === 1;
                const count = selectedCount(sel);
                const setGroup = (next: Record<string, number>) =>
                  setSelections((s) => ({ ...s, [group.id]: next }));
                return (
                  <fieldset key={group.id} className="rounded-2xl border border-border bg-card p-4">
                    <legend className="mb-3 w-full">
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 flex-col">
                          <span className="text-body-lg font-semibold text-foreground">{group.name}</span>
                          <span className="text-meta text-muted-foreground">
                            {group.min_select > 0
                              ? `Elige ${group.min_select === group.max_select ? group.min_select : `${group.min_select} a ${group.max_select}`}`
                              : `Hasta ${group.max_select}`}
                            {" · "}
                            {count}/{group.max_select} elegidos
                          </span>
                        </span>
                        {group.min_select > 0 ? (
                          <RequirementChip done={count >= group.min_select} label="Obligatorio" />
                        ) : (
                          <span className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-caption font-semibold text-muted-foreground">
                            Opcional
                          </span>
                        )}
                      </span>
                    </legend>
                    <ul className="flex flex-col gap-2">
                      {group.options.map((o) => {
                        const n = sel[o.id] ?? 0;
                        return (
                          <li key={o.id}>
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
                                className={cn(choiceClass, n > 0 ? choiceOn : choiceOff)}
                              >
                                <ChoiceMark checked={n > 0} round />
                                <span className="min-w-0 flex-1">{o.name}</span>
                                {o.price > 0 && (
                                  <span className="tabular-nums text-muted-foreground">
                                    +{formatPrice(o.price)}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div
                                className={cn(
                                  "flex min-h-14 items-center gap-2 rounded-xl border pl-3.5 pr-1.5 text-body",
                                  n > 0 ? "border-primary bg-primary-soft/50" : "border-border bg-card"
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                                {o.price > 0 && (
                                  <span className="tabular-nums text-meta text-muted-foreground">
                                    +{formatPrice(o.price)}
                                  </span>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-11 rounded-full bg-card"
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
                                  className="size-11 rounded-full bg-card"
                                  aria-label={`Agregar ${o.name}`}
                                  disabled={
                                    count >= group.max_select ||
                                    (!group.allow_repeat && n >= 1)
                                  }
                                  onClick={() =>
                                    setGroup(bumpOption(group, sel, o.id, 1))
                                  }
                                >
                                  <Plus className="size-4" />
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                );
              })}

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-lg font-semibold text-foreground">Cantidad</span>
                  <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} />
                </div>

                <div className="border-t border-border pt-3">
                  {notesOpen ? (
                    <>
                      <label
                        htmlFor="notes"
                        className="mb-1.5 block text-body-sm font-semibold text-foreground"
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
                        className="rounded-xl text-body-lg"
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNotesOpen(true)}
                      className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-3.5 text-left text-body-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary active:bg-secondary"
                      aria-label="Agregar indicaciones especiales para la cocina"
                    >
                      <PencilLine aria-hidden className="size-4 shrink-0" strokeWidth={2} />
                      {notes.trim() ? notes : "Agregar una indicación (opcional)"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky CTA: however long the description, the button stays
                in the thumb zone. */}
            <div
              className="sticky bottom-0 mt-auto border-t border-border bg-card px-4 pt-3"
              style={{
                paddingBottom:
                  "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {blocked && (
                <p
                  role="status"
                  className="mb-2.5 flex items-center justify-center gap-1.5 text-body-sm font-medium text-attention-soft-foreground"
                >
                  <CircleAlert aria-hidden className="size-4 shrink-0" />
                  {required && !variantId
                    ? "Elige una variante para continuar."
                    : "Completa las opciones obligatorias."}
                </p>
              )}
              <Button
                size="lg"
                onClick={handleAdd}
                disabled={blocked}
                className="clay clay-primary h-14 w-full justify-between rounded-2xl px-5 text-body-lg font-semibold"
                aria-label={`Agregar ${quantity} ${product.name} al pedido - Total: ${formatPrice(unitPrice * quantity)}`}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag aria-hidden className="size-5" strokeWidth={2.25} />
                  Agregar al pedido
                </span>
                <span className="font-display text-title font-bold tabular-nums">
                  {formatPrice(unitPrice * quantity)}
                </span>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const choiceClass =
  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 text-left text-body transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none";
const choiceOn = "border-primary bg-primary-soft/50 font-semibold text-foreground";
const choiceOff = "border-border bg-card text-foreground hover:border-primary/40";

/** Radio/check mark drawn by hand so the selected choice reads at a glance. */
function ChoiceMark({ checked, round }: { checked: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center border-2 transition-colors duration-150",
        round ? "rounded-full" : "rounded-md",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card"
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

/** "Obligatorio" turns green with a check once the group is satisfied. */
function RequirementChip({ done, label }: { done: boolean; label: string }) {
  return done ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-money-in-border bg-money-in-soft px-2.5 py-1 text-caption font-semibold text-money-in-soft-foreground">
      <Check aria-hidden className="size-3.5" strokeWidth={3} />
      Listo
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-attention-border bg-attention-soft px-2.5 py-1 text-caption font-semibold text-attention-soft-foreground">
      <CircleAlert aria-hidden className="size-3.5" strokeWidth={2.5} />
      {label}
    </span>
  );
}
