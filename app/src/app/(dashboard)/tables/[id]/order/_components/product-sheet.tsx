"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { MAX_NOTES_LENGTH } from "@/lib/validations/orders";
import type { NewCartLine } from "@/hooks/use-staff-cart";
import type { StaffCartItem, StaffProductDetail } from "@/types/menu";

export interface SheetProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
}

const EMPTY_DETAIL: StaffProductDetail = { variants: [], groups: [] };

/**
 * Ficha del producto: variante obligatoria (con error visible junto al campo),
 * personalizaciones con +/− según min/max/allow_repeat, nota y cantidad.
 * Se remonta por producto/línea (key), así el estado inicial sale de props.
 */
export function ProductSheet({
  product,
  detail = EMPTY_DETAIL,
  initial,
  sentLine = false,
  onClose,
  onConfirm,
}: {
  product: SheetProduct;
  detail?: StaffProductDetail;
  /** Línea del carrito que se edita (null = producto nuevo). */
  initial: StaffCartItem | null;
  /**
   * Línea ya enviada a cocina: solo se cambia variante y nota (sin cantidad
   * ni personalizaciones); el precio lo recalcula la base.
   */
  sentLine?: boolean;
  onClose: () => void;
  onConfirm: (line: NewCartLine) => void;
}) {
  const required = variantRequired(detail);
  const [variantId, setVariantId] = useState<string | null>(
    initial?.variantId ?? (detail.variants.length === 1 ? detail.variants[0].id : null)
  );
  const [selections, setSelections] = useState<Record<string, Record<string, number>>>(
    initial?.selections ?? {}
  );
  const [note, setNote] = useState(initial?.notes ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [submitted, setSubmitted] = useState(false);

  const variant = detail.variants.find((v) => v.id === variantId);
  const groups = sentLine ? [] : detail.groups;
  const optionsPrice = modifiersPrice(groups, selections);
  const unitPrice = (variant?.price ?? product.price) + optionsPrice;
  const variantError = submitted && required && !variantId;

  function confirm() {
    setSubmitted(true);
    if (required && !variantId) return;
    if (groups.some((g) => groupError(g, selections[g.id] ?? {}))) return;
    const modifiers = modifiersSummary(groups, selections);
    onConfirm({
      productId: product.id,
      name: product.name,
      price: unitPrice,
      quantity,
      notes: note.trim(),
      variantId: variantId ?? undefined,
      variantName: variant?.name || undefined,
      modifiers: modifiers || undefined,
      modifierPicks: sentLine ? undefined : modifierPicks(groups, selections),
      selections,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            {sentLine ? "El precio lo recalcula la base al guardar" : product.description || formatPrice(unitPrice)}
          </DialogDescription>
        </DialogHeader>

        {detail.variants.length > 1 && (
          <fieldset aria-describedby={variantError ? "variant-error" : undefined}>
            <legend className="mb-2 text-body-sm font-semibold">
              Variante <span className="text-wine">(obligatoria)</span>
            </legend>
            <div role="radiogroup" className="flex flex-col gap-2">
              {detail.variants.map((v) => {
                const active = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVariantId(v.id)}
                    className={cn(
                      "flex min-h-11 items-center justify-between rounded-control border px-3.5 text-left text-body transition-colors",
                      active
                        ? "border-primary bg-secondary font-semibold"
                        : "border-border bg-card",
                      variantError && "border-destructive"
                    )}
                  >
                    <span>{v.name || product.name}</span>
                    <span className="tabular-nums text-wine">{formatPrice(v.price)}</span>
                  </button>
                );
              })}
            </div>
            {variantError && (
              <p id="variant-error" role="alert" className="mt-1.5 text-body-sm font-medium text-destructive">
                Elige una variante para continuar.
              </p>
            )}
          </fieldset>
        )}

        {groups.map((group) => {
          const sel = selections[group.id] ?? {};
          const error = submitted ? groupError(group, sel) : null;
          const single = group.max_select === 1;
          return (
            <fieldset key={group.id}>
              <legend className="mb-2 text-body-sm font-semibold">
                {group.name}{" "}
                <span className="font-normal text-muted-foreground">
                  {group.min_select > 0 ? `elige ${group.min_select === group.max_select ? group.min_select : `${group.min_select}–${group.max_select}`}` : `hasta ${group.max_select}`}
                  {" · "}
                  {selectedCount(sel)}/{group.max_select}
                </span>
              </legend>
              <ul className="flex flex-col gap-2">
                {group.options.map((o) => {
                  const n = sel[o.id] ?? 0;
                  const setGroup = (next: Record<string, number>) =>
                    setSelections((s) => ({ ...s, [group.id]: next }));
                  return (
                    <li key={o.id} className="flex items-center gap-2">
                      {single ? (
                        <button
                          type="button"
                          aria-pressed={n > 0}
                          onClick={() =>
                            setGroup(n > 0 && group.min_select === 0 ? {} : { [o.id]: 1 })
                          }
                          className={cn(
                            "flex min-h-11 flex-1 items-center justify-between rounded-control border px-3.5 text-left text-body",
                            n > 0 ? "border-primary bg-secondary font-semibold" : "border-border bg-card"
                          )}
                        >
                          <span>{o.name}</span>
                          {o.price > 0 && <span className="tabular-nums text-muted-foreground">+{formatPrice(o.price)}</span>}
                        </button>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-body">{o.name}</span>
                          {o.price > 0 && <span className="tabular-nums text-muted-foreground">+{formatPrice(o.price)}</span>}
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-11 rounded-full"
                            aria-label={`Quitar ${o.name}`}
                            disabled={n === 0}
                            onClick={() => setGroup(bumpOption(group, sel, o.id, -1))}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="w-5 text-center font-semibold tabular-nums">{n}</span>
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
                            onClick={() => setGroup(bumpOption(group, sel, o.id, 1))}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {error && (
                <p role="alert" className="mt-1.5 text-body-sm font-medium text-destructive">
                  {error}
                </p>
              )}
            </fieldset>
          );
        })}

        <div>
          <label htmlFor="line-note" className="mb-1.5 block text-body-sm font-semibold">
            Nota
          </label>
          <Textarea
            id="line-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTES_LENGTH}
            rows={2}
            placeholder="Ej: sin cebolla, término medio…"
            className="rounded-control text-body-sm"
          />
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          {sentLine ? (
            <span />
          ) : (
            <QuantityStepper label={product.name} value={quantity} onChange={setQuantity} />
          )}
          <Button type="button" size="lg" className="min-h-11 flex-1 rounded-control sm:flex-none" onClick={confirm}>
            {initial ? "Guardar cambios" : "Agregar"}
            {sentLine ? "" : ` · ${formatPrice(unitPrice * quantity)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
