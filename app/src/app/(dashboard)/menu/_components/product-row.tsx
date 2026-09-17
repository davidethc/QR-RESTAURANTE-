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
  slug,
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
  slug: string;
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
      const result = await toggleProductAvailable(product.id, slug, checked);
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
        "flex items-center gap-3 rounded-xl border-l-4 border bg-card p-3",
        product.available ? "border-l-emerald-500" : "border-l-amber-500",
        isDragging && "opacity-40"
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-0.5">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-hidden="true"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Mover producto arriba"
            className="text-muted-foreground disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Mover producto abajo"
            className="text-muted-foreground disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {product.name}
        </p>
        <p className="text-sm text-wine">{formatPrice(product.price)}</p>
      </div>

      <Switch
        checked={product.available}
        onCheckedChange={handleToggle}
        disabled={isPending}
        aria-label="Disponible"
      />

      <ProductDialog
        restaurantId={restaurantId}
        slug={slug}
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
        action={() => deleteProduct(product.id, slug)}
        successMessage="Producto eliminado"
        onSuccess={() => router.refresh()}
      />
    </motion.div>
  );
}
