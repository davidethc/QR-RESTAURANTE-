"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Trash2, MessageCircle, ShoppingBag, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import { createOrder } from "@/lib/actions/orders";
import { buildWhatsappUrl, composeOrderMessage } from "@/lib/whatsapp";
import type { CartItem, PublicProduct } from "@/types/menu";

export function CartSheetV2({
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
  tableNumber: number | null;
  restaurantName: string;
  whatsappPhone: string | null;
  suggestedProducts: PublicProduct[];
  onAddSuggestion: (product: PublicProduct) => void;
}) {
  const router = useRouter();
  const inTable = tableNumber !== null;

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 p-0">
        {/* Header fijo */}
        <div className="flex items-center justify-between border-b bg-background px-6 py-4">
          <div>
            <SheetTitle className="font-display text-[20px] font-bold">
              {inTable ? `Mi pedido — Mesa ${tableNumber}` : "Mi pedido"}
            </SheetTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          {items.length > 0 && (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
              }
              title="¿Vaciar el pedido?"
              description="Se quitarán todos los platos que agregaste."
              confirmLabel="Vaciar"
              destructive
              action={async () => ({ ok: true as const, data: null })}
              onSuccess={onClearCart}
            />
          )}
        </div>

        {/* Content area - scrollable */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-display text-lg font-bold text-foreground">
                  Tu carrito está vacío
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agrega platos para empezar
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-6 py-4">
              <AnimatePresence mode="popLayout">
                {items.map((item, index) => (
                  <motion.div
                    key={`${item.product.id}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-display truncate text-[15px] font-bold text-foreground">
                        {item.product.name}
                      </p>
                      {item.notes && (
                        <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">
                          {item.notes}
                        </p>
                      )}
                      <p className="font-display mt-2 text-[16px] font-bold text-primary">
                        {formatPrice(item.subtotal)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {/* Quantity controls */}
                      <div className="flex items-center gap-1.5 rounded-xl bg-muted/50 p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-md p-0"
                          onClick={() =>
                            onUpdateQuantity(index, item.quantity - 1)
                          }
                          aria-label={`Disminuir cantidad de ${item.product.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="font-display w-6 text-center text-sm font-bold tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-md p-0"
                          onClick={() =>
                            onUpdateQuantity(index, item.quantity + 1)
                          }
                          aria-label={`Aumentar cantidad de ${item.product.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Delete */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-lg"
                        onClick={() => onRemove(index)}
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Sugerencias */}
          {items.length > 0 && suggestionsToShow.length > 0 && (
            <div className="border-t px-6 py-4">
              <p className="font-display mb-3 text-[14px] font-bold text-foreground">
                ¿Agregas algo más?
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {suggestionsToShow.slice(0, 6).map((product) => (
                  <motion.button
                    key={product.id}
                    type="button"
                    onClick={() => onAddSuggestion(product)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-left transition-all hover:bg-muted active:bg-muted"
                  >
                    <span className="font-display line-clamp-2 text-[13px] font-bold text-foreground">
                      {product.name}
                    </span>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-[14px] font-bold text-primary">
                        {formatPrice(product.price)}
                      </span>
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-primary-foreground group-hover:scale-110 transition-transform">
                        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer sticky - Total & Action */}
        {items.length > 0 && (
          <div className="border-t bg-background px-6 py-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-[16px] font-semibold text-muted-foreground">
                Total
              </span>
              <span className="font-display text-[24px] font-bold text-foreground">
                {formatPrice(total)}
              </span>
            </div>

            {inTable ? (
              <ConfirmDialog
                trigger={
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <Button
                      size="lg"
                      className="clay clay-primary h-12 w-full rounded-2xl text-[15px] font-semibold"
                    >
                      Enviar pedido
                    </Button>
                  </motion.div>
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
              <motion.a
                href={whatsappOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="clay clay-primary flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-primary-foreground"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={2} />
                Pedir por WhatsApp
              </motion.a>
            ) : (
              <p className="rounded-2xl bg-secondary px-4 py-3 text-center text-[13px] text-muted-foreground">
                Este restaurante todavía no cargó su número de WhatsApp.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
