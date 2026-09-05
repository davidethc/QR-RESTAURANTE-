"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, MessageCircle } from "lucide-react";
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
import { buildWhatsappUrl, composeOrderMessage } from "@/lib/whatsapp";
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
  onRemove: (index: number) => void;
  onClearCart: () => void;
  slug: string;
  /** null = modo carta: el pedido no va a una mesa, se manda por
   *  WhatsApp al restaurante. */
  tableNumber: number | null;
  restaurantName: string;
  whatsappPhone: string | null;
  suggestedProducts: PublicProduct[];
  onAddSuggestion: (product: PublicProduct) => void;
}) {
  const router = useRouter();
  const inTable = tableNumber !== null;

  const whatsappOrderUrl = buildWhatsappUrl(
    whatsappPhone,
    composeOrderMessage(restaurantName, items, total)
  );

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
          <SheetTitle className="font-display text-[19px]">
            {inTable ? `Mi pedido — Mesa ${tableNumber}` : "Mi pedido"}
          </SheetTitle>
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

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-10 rounded-full"
                      onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-10 rounded-full"
                      onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                    >
                      <Plus />
                    </Button>
                    {/* Separada del "+": pegada, un dedo la toca por error
                        y el plato desaparece sin aviso. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-1 size-10 rounded-full"
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
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {suggestionsToShow.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAddSuggestion(product)}
                  className="flex min-h-16 w-[132px] shrink-0 flex-col justify-between gap-1.5 rounded-xl bg-card px-3 py-2.5 text-left shadow-card active:bg-muted"
                >
                  <span className="font-display line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
                    {product.name}
                  </span>
                  <span className="flex items-center justify-between gap-1">
                    <span className="font-display text-[13px] font-semibold tabular-nums text-wine">
                      {formatPrice(product.price)}
                    </span>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Plus className="size-3.5" strokeWidth={2.75} />
                    </span>
                  </span>
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
            {/* En mesa el pedido entra al panel del mesero. Fuera del
                local no hay mesa a la que mandarlo, así que el mismo
                botón se convierte en "Pedir por WhatsApp" y viaja como
                mensaje ya redactado al número del restaurante. */}
            {inTable ? (
              <ConfirmDialog
                trigger={
                  <Button
                    size="lg"
                    className="clay clay-primary h-12 w-full rounded-2xl text-[15px]"
                  >
                    Enviar pedido
                  </Button>
                }
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
            ) : whatsappOrderUrl ? (
              <a
                href={whatsappOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="clay clay-primary flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                Pedir por WhatsApp
              </a>
            ) : (
              <p className="rounded-xl bg-secondary px-3 py-2.5 text-center text-[13px] text-muted-foreground">
                Este restaurante todavía no cargó su número de WhatsApp.
              </p>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
