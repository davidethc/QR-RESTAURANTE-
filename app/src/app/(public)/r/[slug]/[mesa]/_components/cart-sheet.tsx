"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Minus, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import { createOrder } from "@/lib/actions/orders";
import type { CartItem, PublicProduct } from "@/types/menu";

export function CartSheet({
  open,
  onOpenChange,
  items,
  total,
  onUpdateQuantity,
  onRemove,
  onClearCart,
  slug,
  tableNumber,
  suggestedProducts,
  onAddSuggestion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  total: number;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
  onClearCart: () => void;
  slug: string;
  tableNumber: number;
  suggestedProducts: PublicProduct[];
  onAddSuggestion: (product: PublicProduct) => void;
}) {
  const router = useRouter();

  const cartProductIds = useMemo(
    () => new Set(items.map((item) => item.product.id)),
    [items]
  );
  const suggestionsToShow = suggestedProducts.filter(
    (p) => !cartProductIds.has(p.id)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col">
        <SheetHeader className="text-left">
          <SheetTitle>Mi pedido — Mesa {tableNumber}</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground">
            Tu carrito está vacío.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto px-4">
            <div className="flex flex-col gap-3 pb-4">
              {items.map((item, index) => (
                <div
                  key={`${item.product.id}-${index}`}
                  className="flex items-start justify-between gap-3 border-b pb-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.product.name}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground">
                        {item.notes}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-semibold text-wine">
                      {formatPrice(item.subtotal)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-5 text-center text-sm tabular-nums">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                    >
                      <Plus />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(index)}
                      aria-label="Quitar"
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && suggestionsToShow.length > 0 && (
          <div className="flex flex-col gap-2 border-t px-4 pt-3">
            <p className="text-sm font-medium text-foreground">
              ¿Agregas algo más?
            </p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {suggestionsToShow.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAddSuggestion(product)}
                  className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border bg-card p-2 text-center active:bg-muted"
                >
                  <div className="relative h-12 w-12 overflow-hidden rounded-md bg-muted">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-1 text-[11px] font-medium text-foreground">
                    {product.name}
                  </p>
                  <p className="text-[11px] font-semibold text-primary">
                    + {formatPrice(product.price)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <SheetFooter className="gap-3 border-t pt-3">
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            <ConfirmDialog
              trigger={<Button size="lg" className="w-full">Enviar pedido</Button>}
              title="¿Confirmar pedido?"
              description={`Mesa ${tableNumber} · ${formatPrice(total)} · Revisa tu pedido antes de enviarlo.`}
              confirmLabel="Enviar pedido"
              action={() => createOrder(items)}
              onSuccess={(orderId) => {
                notify.orderPlaced();
                onClearCart();
                onOpenChange(false);
                router.push(`/r/${slug}/${tableNumber}/order/${orderId}`);
              }}
            />
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
