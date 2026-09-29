"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { UtensilsCrossed, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ProductDialog } from "./product-dialog";
import { notify } from "@/lib/notifications";
import { formatPrice, cn } from "@/lib/utils";
import { deleteProduct, toggleProductAvailable } from "@/lib/actions/menu";
import type { AdminCategory, AdminProduct } from "@/types/staff";

export function ProductRow({
  product,
  restaurantId,
  categories,
  allProducts,
  isDragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  product: AdminProduct;
  restaurantId: string;
  categories: AdminCategory[];
  allProducts: AdminProduct[];
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      const result = await toggleProductAvailable(product.id, checked);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-secondary/60 md:px-5",
        isDragging && "opacity-40"
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="cursor-grab active:cursor-grabbing"
          aria-hidden="true"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Mover producto arriba"
            className="disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Mover producto abajo"
            className="disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-control border border-border bg-secondary">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="36px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      <p className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground">
        {product.name}
      </p>

      <p className="w-20 shrink-0 text-right text-body-sm text-foreground tabular-nums">
        {formatPrice(product.price)}
      </p>

      <Switch
        checked={product.available}
        onCheckedChange={handleToggle}
        disabled={isPending}
        aria-label="Disponible"
      />

      <div className="flex shrink-0 items-center gap-0.5">
        <ProductDialog
          restaurantId={restaurantId}
          categories={categories}
          allProducts={allProducts}
          product={product}
        />

        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label="Eliminar producto">
              <Trash2 className="h-4 w-4" />
            </Button>
          }
          title="¿Eliminar este producto?"
          description={`"${product.name}" se eliminará de la carta. Esta acción no se puede deshacer.`}
          destructive
          confirmLabel="Eliminar"
          action={() => deleteProduct(product.id)}
          successMessage="Producto eliminado"
          onSuccess={() => router.refresh()}
        />
      </div>
    </motion.div>
  );
}
