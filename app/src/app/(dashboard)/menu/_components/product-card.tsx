"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronDown, ChevronUp, GripVertical, Layers, Pencil, Star, Trash2, UtensilsCrossed } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";
import { deleteProduct, toggleProductAvailable } from "@/lib/actions/menu";
import type { AdminCategory, AdminProduct } from "@/types/staff";
import { ProductEditor, StatusChip } from "./product-editor";

const ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-button text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";

/**
 * One product as a compact card: tapping the photo/name opens the editor;
 * the bottom bar keeps availability, order and delete within reach. A sold
 * out product turns red with an icon + "Agotado", never color alone.
 */
export function ProductCard({
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
  // Optimista: el interruptor responde al instante y vuelve atrás si falla.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  // Cuando llega el valor del servidor, manda él.
  const [serverValue, setServerValue] = useState(product.available);
  if (serverValue !== product.available) {
    setServerValue(product.available);
    setOptimistic(null);
  }
  const available = optimistic ?? product.available;

  function handleToggle(checked: boolean) {
    setOptimistic(checked);
    startTransition(async () => {
      const result = await toggleProductAvailable(product.id, checked);
      if (!result.ok) {
        setOptimistic(null);
        notify.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  const multiPrice = product.min_variant_price !== undefined;

  return (
    <article
      aria-label={product.name}
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-card border bg-card shadow-sm transition-[border-color,box-shadow,opacity] duration-150 hover:shadow-md motion-reduce:transition-none",
        available ? "border-border" : "border-money-out-border bg-money-out-soft",
        isDragging && "opacity-40"
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <ProductEditor
        restaurantId={restaurantId}
        categories={categories}
        allProducts={allProducts}
        product={product}
        trigger={
          <button
            type="button"
            aria-label={`Editar ${product.name}`}
            className="flex min-h-24 w-full items-start gap-3 p-3 text-left outline-none transition-colors duration-150 hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60"
          >
            <span
              className={cn(
                "relative size-16 shrink-0 overflow-hidden rounded-control border border-border bg-secondary",
                !available && "opacity-60 grayscale"
              )}
            >
              {product.image_url ? (
                <Image src={product.image_url} alt="" fill sizes="64px" className="object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <UtensilsCrossed className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 wrap-anywhere text-body-sm font-semibold leading-snug text-foreground">
                {product.name}
              </span>
              <span className="text-body font-semibold tabular-nums text-foreground">
                {multiPrice ? (
                  <>
                    <span className="text-meta font-medium text-muted-foreground">Desde </span>
                    {formatPrice(product.min_variant_price!)}
                  </>
                ) : (
                  formatPrice(product.price)
                )}
              </span>
              <span className="flex flex-wrap gap-1">
                <StatusChip available={available} />
                {product.featured && (
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.attention)}>
                    <Star className="size-3.5" aria-hidden /> Destacado
                  </span>
                )}
                {multiPrice && (
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.info)}>
                    <Layers className="size-3.5" aria-hidden /> {product.variant_count} precios
                  </span>
                )}
              </span>
            </span>
            <Pencil
              className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 max-lg:opacity-100"
              aria-hidden
            />
          </button>
        }
      />

      <div
        className={cn(
          "mt-auto flex items-center gap-1 border-t px-2 py-1",
          available ? "border-border" : "border-money-out-border"
        )}
      >
        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-button px-1">
          <Switch
            checked={available}
            onCheckedChange={handleToggle}
            disabled={isPending}
            aria-label={`${product.name}: ${available ? "Disponible" : "Agotado"}`}
          />
          <span className={cn("whitespace-nowrap text-meta font-semibold", available ? "text-money-in-soft-foreground" : "text-money-out-soft-foreground")}>
            {available ? "En venta" : "Agotado"}
          </span>
        </label>
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex size-11 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing max-md:hidden"
          title="Arrastra para reordenar"
          aria-hidden="true"
        >
          <GripVertical className="size-4" />
        </span>
        <button type="button" onClick={onMoveUp} disabled={isFirst} aria-label={`Mover ${product.name} antes`} className={cn(posPressable, ICON_BUTTON)}>
          <ChevronUp className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast} aria-label={`Mover ${product.name} después`} className={cn(posPressable, ICON_BUTTON)}>
          <ChevronDown className="size-4" aria-hidden />
        </button>
        <ConfirmDialog
          trigger={
            <button type="button" aria-label={`Eliminar ${product.name}`} className={cn(posPressable, ICON_BUTTON, "hover:bg-money-out-soft hover:text-money-out-soft-foreground")}>
              <Trash2 className="size-4" aria-hidden />
            </button>
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
    </article>
  );
}
