"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, PencilLine } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCategoryIcon } from "@/lib/category-icons";
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
              {/* La foto manda: es lo que hace que un plato se antoje.
                  Sin foto se reserva el mismo espacio con el emoji de
                  la categoría, para que la ficha no cambie de forma
                  cuando el restaurante suba las suyas. */}
              <div className="relative h-56 w-full shrink-0 overflow-hidden bg-gradient-to-br from-accent/50 via-secondary to-secondary">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    sizes="100vw"
                    priority
                    className="object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 flex select-none items-center justify-center text-7xl opacity-[0.18]"
                  >
                    {getCategoryIcon(categoryName ?? "")}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 px-5 pb-1 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <SheetTitle className="font-display text-[22px] font-semibold leading-tight">
                    {product.name}
                  </SheetTitle>
                  <span className="font-display shrink-0 pt-1 text-xl font-semibold tabular-nums text-wine">
                    {formatPrice(product.price)}
                  </span>
                </div>
                {product.description && (
                  <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                )}
              </div>
            </SheetHeader>

            <div className="px-5 pb-4 pt-3">
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
                    className="rounded-xl text-[15px]"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border px-3.5 text-left text-[13.5px] font-medium text-muted-foreground active:bg-secondary"
                >
                  <PencilLine className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {notes.trim() ? notes : "Agregar una indicación (opcional)"}
                </button>
              )}
            </div>

            {/* Barra de acción fija: cantidad + agregar, siempre al
                alcance del pulgar aunque la descripción sea larga. */}
            <div
              className="sticky bottom-0 flex items-center gap-3 border-t border-border/60 bg-card px-5 pt-3"
              style={{
                paddingBottom:
                  "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-secondary/60 p-1">
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
                  className="w-6 text-center text-[15px] font-semibold tabular-nums"
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

              <Button
                size="lg"
                onClick={handleAdd}
                className={cn(
                  "clay clay-primary h-12 flex-1 justify-between rounded-2xl px-4 text-[15px]"
                )}
              >
                <span>Agregar</span>
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
