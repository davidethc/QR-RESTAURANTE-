"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FolderOpen, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { CategoryDialog } from "./category-dialog";
import { ProductEditor } from "./product-editor";
import { ProductCard } from "./product-card";
import { deleteCategory } from "@/lib/actions/menu";
import { cn } from "@/lib/utils";
import type { AdminCategory, AdminProduct } from "@/types/staff";

const ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-button text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";

/**
 * A category: a white header card (name, counts, actions) and its products as
 * a grid of cards right below, on the page background. Header and grid are
 * siblings — no card inside a card — and categories are spaced apart.
 */
export function CategoryAdminSection({
  category,
  products,
  allCategories,
  allProducts,
  restaurantId,
  isDragging,
  onCategoryDragStart,
  onCategoryDragEnd,
  onCategoryDrop,
  onCategoryMoveUp,
  onCategoryMoveDown,
  isFirstCategory,
  isLastCategory,
  draggedProductId,
  onProductDragStart,
  onProductDragEnd,
  onProductDrop,
  onProductMove,
}: {
  category: AdminCategory | null;
  products: AdminProduct[];
  allCategories: AdminCategory[];
  allProducts: AdminProduct[];
  restaurantId: string;
  isDragging: boolean;
  onCategoryDragStart?: () => void;
  onCategoryDragEnd?: () => void;
  onCategoryDrop?: () => void;
  onCategoryMoveUp?: () => void;
  onCategoryMoveDown?: () => void;
  isFirstCategory?: boolean;
  isLastCategory?: boolean;
  draggedProductId: string | null;
  onProductDragStart: (id: string) => void;
  onProductDragEnd: () => void;
  onProductDrop: (targetId: string) => void;
  onProductMove: (id: string, direction: "up" | "down") => void;
}) {
  const router = useRouter();
  const soldOut = products.filter((p) => !p.available).length;
  const name = category?.name ?? "Sin categoría";

  const addProduct = (label: string, variant: "solid" | "outline") => (
    <ProductEditor
      restaurantId={restaurantId}
      categories={allCategories}
      allProducts={allProducts}
      defaultCategoryId={category?.id}
      trigger={
        <button
          type="button"
          className={cn(
            posPressable,
            "flex min-h-11 items-center gap-1.5 rounded-button px-3 text-body-sm font-semibold",
            variant === "solid"
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "border-2 border-border bg-card text-foreground hover:border-border-strong"
          )}
        >
          <Plus className="size-4" aria-hidden /> {label}
        </button>
      }
    />
  );

  return (
    <section
      aria-label={name}
      className={cn("flex scroll-mt-4 flex-col gap-3 transition-opacity duration-150", isDragging && "opacity-40")}
      id={category ? `cat-${category.id}` : "cat-none"}
      onDragOver={category ? (e) => e.preventDefault() : undefined}
      onDrop={category ? onCategoryDrop : undefined}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-card px-3 py-2 shadow-sm">
        {category && (
          <div className="flex shrink-0 items-center">
            <span
              draggable
              onDragStart={onCategoryDragStart}
              onDragEnd={onCategoryDragEnd}
              className="flex size-11 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing max-md:hidden"
              title="Arrastra para reordenar"
              aria-hidden="true"
            >
              <GripVertical className="size-4" />
            </span>
            <button type="button" onClick={onCategoryMoveUp} disabled={isFirstCategory} aria-label={`Mover ${name} arriba`} className={cn(posPressable, ICON_BUTTON)}>
              <ChevronUp className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={onCategoryMoveDown} disabled={isLastCategory} aria-label={`Mover ${name} abajo`} className={cn(posPressable, ICON_BUTTON)}>
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        )}
        {!category && (
          <span className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <FolderOpen className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lead font-semibold leading-tight text-foreground">
            <span className="wrap-anywhere">{name}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold tabular-nums text-muted-foreground">
              {products.length} {products.length === 1 ? "producto" : "productos"}
            </span>
            {soldOut > 0 && (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold tabular-nums", toneSoft["money-out"])}>
                <X className="size-3.5" strokeWidth={3} aria-hidden /> {soldOut} {soldOut === 1 ? "agotado" : "agotados"}
              </span>
            )}
          </h2>
          {category?.description && (
            <p className="mt-0.5 truncate text-meta text-muted-foreground">{category.description}</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {addProduct("Producto", "outline")}
          {category && (
            <>
              <CategoryDialog
                restaurantId={restaurantId}
                category={category}
                trigger={
                  <button type="button" aria-label={`Editar categoría ${name}`} className={cn(posPressable, ICON_BUTTON)}>
                    <Pencil className="size-4" aria-hidden />
                  </button>
                }
              />
              <ConfirmDialog
                trigger={
                  <button type="button" aria-label={`Eliminar categoría ${name}`} className={cn(posPressable, ICON_BUTTON, "hover:bg-money-out-soft hover:text-money-out-soft-foreground")}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                }
                title="¿Eliminar esta categoría?"
                description={
                  products.length > 0
                    ? `"${category.name}" tiene ${products.length} producto(s). Elimínalos o muévelos primero.`
                    : `"${category.name}" se eliminará. Esta acción no se puede deshacer.`
                }
                destructive
                confirmLabel="Eliminar"
                action={() => deleteCategory(category.id)}
                successMessage="Categoría eliminada"
                onSuccess={() => router.refresh()}
              />
            </>
          )}
        </div>
      </header>

      {products.length === 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-card border-2 border-dashed border-border bg-card/60 px-4 py-6 text-center">
          <p className="text-body-sm text-muted-foreground">Esta categoría aún no tiene productos.</p>
          {addProduct("Agregar producto", "solid")}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {products.map((product, index) => (
            <li key={product.id} className="flex">
              <div className="flex w-full animate-in fade-in duration-150 motion-reduce:animate-none [&>article]:w-full">
                <ProductCard
                  product={product}
                  restaurantId={restaurantId}
                  categories={allCategories}
                  allProducts={allProducts}
                  isDragging={draggedProductId === product.id}
                  onDragStart={() => onProductDragStart(product.id)}
                  onDragEnd={onProductDragEnd}
                  onDrop={() => onProductDrop(product.id)}
                  onMoveUp={() => onProductMove(product.id, "up")}
                  onMoveDown={() => onProductMove(product.id, "down")}
                  isFirst={index === 0}
                  isLast={index === products.length - 1}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
