"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Minus, Plus, UtensilsCrossed } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

/**
 * Detalle de producto: cantidad, observaciones, precio que se
 * actualiza al instante. Se abre al tocar una tarjeta disponible.
 */
export function ProductSheet({
  product,
  onOpenChange,
  onAdd,
}: {
  product: PublicProduct | null;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: PublicProduct, quantity: number, notes: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setNotes("");
    }
  }, [product]);

  function handleAdd() {
    if (!product) return;
    onAdd(product, quantity, notes.trim());
    onOpenChange(false);
  }

  return (
    <Sheet open={product !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        {product && (
          <>
            <SheetHeader className="text-left">
              <div className="relative -mx-6 -mt-6 mb-2 h-40 w-[calc(100%+3rem)] bg-muted">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    sizes="100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>
              <SheetTitle className="text-lg">{product.name}</SheetTitle>
              <p className="text-lg font-semibold text-wine">
                {formatPrice(product.price)}
              </p>
              {product.description && (
                <p className="text-sm text-muted-foreground">
                  {product.description}
                </p>
              )}
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-4">
              <div>
                <label
                  htmlFor="notes"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Observaciones
                </label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: sin cebolla"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Cantidad
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus />
                  </Button>
                  <span className="w-6 text-center text-base font-medium tabular-nums">
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((q) => q + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
              </div>

              <Button size="lg" onClick={handleAdd} className="w-full">
                Agregar — {formatPrice(product.price * quantity)}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
