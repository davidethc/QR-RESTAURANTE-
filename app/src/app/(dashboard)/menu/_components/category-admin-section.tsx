"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryDialog } from "./category-dialog";
import { ProductDialog } from "./product-dialog";
import { ProductRow } from "./product-row";
import { deleteCategory } from "@/lib/actions/menu";
import { cn } from "@/lib/utils";
import type { AdminCategory, AdminProduct } from "@/types/staff";

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

  return (
    <motion.section
      layout
      className={cn(isDragging && "opacity-40")}
      onDragOver={category ? (e) => e.preventDefault() : undefined}
      onDrop={category ? onCategoryDrop : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary px-4 py-2.5 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {category && (
            <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
              <span
                draggable
                onDragStart={onCategoryDragStart}
                onDragEnd={onCategoryDragEnd}
                className="cursor-grab active:cursor-grabbing"
                aria-hidden="true"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={onCategoryMoveUp}
                  disabled={isFirstCategory}
                  aria-label="Mover categoría arriba"
                  className="disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={onCategoryMoveDown}
                  disabled={isLastCategory}
                  aria-label="Mover categoría abajo"
                  className="disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <div className="min-w-0">
            <span className="text-body-sm font-semibold text-foreground">
              {category?.name ?? "Sin categoría"}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {products.length}
              </span>
            </span>
            {category?.description && (
              <p className="truncate text-caption text-muted-foreground">
                {category.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ProductDialog
            restaurantId={restaurantId}
            categories={allCategories}
            allProducts={allProducts}
            defaultCategoryId={category?.id}
          />
          {category && (
            <>
              <CategoryDialog
                restaurantId={restaurantId}
                category={category}
              />
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Eliminar categoría">
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
      </div>

      {products.length === 0 ? (
        <EmptyState title="Sin productos todavía" />
      ) : (
        <div className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {products.map((product, index) => (
              <ProductRow
                key={product.id}
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
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}
