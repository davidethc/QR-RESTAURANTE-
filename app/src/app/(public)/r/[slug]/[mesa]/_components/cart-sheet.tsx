"use client";

import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
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
import type { CartItem } from "@/types/menu";

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
}) {
  const router = useRouter();

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
