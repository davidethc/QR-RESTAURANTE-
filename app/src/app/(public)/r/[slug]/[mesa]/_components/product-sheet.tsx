"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, PencilLine, ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

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
  categoryName,
  onOpenChange,
  onAdd,
}: {
  product: PublicProduct | null;
  categoryName?: string;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: PublicProduct, quantity: number, notes: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setNotes("");
      setNotesOpen(false);
    }
  }, [product]);

  function handleAdd() {
    if (!product) return;
    onAdd(product, quantity, notes.trim());
    onOpenChange(false);
  }

  return (
    <Sheet open={product !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] gap-0 overflow-y-auto p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
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
                      priority
                      className="object-cover"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 px-5 pt-6">
                <SheetTitle className="font-display text-[22px] font-semibold leading-tight">
                  {product.name}
                </SheetTitle>
                {product.description && (
                  <p className="text-[14.5px] leading-relaxed text-muted-foreground">
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
                <span className="text-[14px] font-semibold text-foreground">
                  Precio
                </span>
                <span className="font-display text-xl font-semibold tabular-nums text-wine">
                  {formatPrice(product.price)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold text-foreground">
                  Cantidad
                </span>
                <div className="neu-inset flex items-center gap-1 rounded-full bg-secondary p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar uno"
                    className="size-10 rounded-full hover:bg-card"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.5} />
                  </Button>
                  <span
                    aria-live="polite"
                    className="w-7 text-center text-[15px] font-semibold tabular-nums"
                  >
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Agregar uno"
                    className="size-10 rounded-full hover:bg-card"
                    onClick={() => setQuantity((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </Button>
                </div>
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
                  className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-dashed border-border px-3.5 text-left text-[13.5px] font-medium text-muted-foreground active:bg-secondary"
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
                className={cn(
                  "clay clay-primary h-13 w-full justify-between rounded-2xl px-5 text-[15px]"
                )}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" strokeWidth={2.25} />
                  Agregar al pedido
                </span>
                <span className="font-display text-base font-semibold tabular-nums">
                  {formatPrice(product.price * quantity)}
                </span>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
