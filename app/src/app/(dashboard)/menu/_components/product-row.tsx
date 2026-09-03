"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { UtensilsCrossed, Trash2, GripVertical } from "lucide-react";
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
  isDragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  product: AdminProduct;
  restaurantId: string;
  slug: string;
  categories: AdminCategory[];
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
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
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3",
        isDragging && "opacity-40"
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label="Arrastrar para reordenar producto"
      >
        <GripVertical className="h-4 w-4" />
      </span>

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
    </div>
  );
}
