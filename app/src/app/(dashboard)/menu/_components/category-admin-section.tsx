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
  slug,
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
  slug: string;
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
      className={cn("flex flex-col gap-3", isDragging && "opacity-40")}
      onDragOver={category ? (e) => e.preventDefault() : undefined}
      onDrop={category ? onCategoryDrop : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {category && (
            <div className="flex items-center gap-0.5">
              <span
                draggable
                onDragStart={onCategoryDragStart}
                onDragEnd={onCategoryDragEnd}
                className="cursor-grab text-muted-foreground active:cursor-grabbing"
                aria-hidden="true"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={onCategoryMoveUp}
                  disabled={isFirstCategory}
                  aria-label="Mover categoría arriba"
                  className="text-muted-foreground disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onCategoryMoveDown}
                  disabled={isLastCategory}
                  aria-label="Mover categoría abajo"
                  className="text-muted-foreground disabled:pointer-events-none disabled:opacity-30 hover:text-foreground"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {category?.name ?? "Sin categoría"}
            </h2>
            {category?.description && (
              <p className="text-sm text-muted-foreground">
                {category.description}
              </p>
            )}
          </div>
        </div>
        {category && (
          <div className="flex items-center gap-1">
            <CategoryDialog
              restaurantId={restaurantId}
              slug={slug}
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
              action={() => deleteCategory(category.id, slug)}
              successMessage="Categoría eliminada"
              onSuccess={() => router.refresh()}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {products.length === 0 ? (
          <EmptyState title="Sin productos todavía" />
        ) : (
          <AnimatePresence initial={false}>
            {products.map((product, index) => (
              <ProductRow
                key={product.id}
                product={product}
                restaurantId={restaurantId}
                slug={slug}
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
        )}
      </div>

      <ProductDialog
        restaurantId={restaurantId}
        slug={slug}
        categories={allCategories}
        allProducts={allProducts}
        defaultCategoryId={category?.id}
      />
    </motion.section>
  );
}
