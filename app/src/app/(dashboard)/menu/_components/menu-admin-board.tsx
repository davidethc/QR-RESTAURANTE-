"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryAdminSection } from "./category-admin-section";
import { reorderCategories, reorderProducts } from "@/lib/actions/menu";
import { notify } from "@/lib/notifications";
import type { AdminCategory, AdminProduct } from "@/types/staff";

/**
 * Reordenar arrastra-y-suelta: el estado local se mueve al instante
 * (optimista) y la posición real se guarda después — así no hay que
 * esperar a la base para ver el cambio. Si el guardado falla,
 * router.refresh() trae de vuelta el orden real del servidor.
 */
export function MenuAdminBoard({
  restaurantId,
  categories: initialCategories,
  products: initialProducts,
}: {
  restaurantId: string;
  categories: AdminCategory[];
  products: AdminProduct[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);

  function handleCategoryDrop(targetId: string) {
    const draggedId = draggedCategoryId;
    setDraggedCategoryId(null);
    if (!draggedId || draggedId === targetId) return;

    const from = categories.findIndex((c) => c.id === draggedId);
    const to = categories.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;

    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCategories(next);

    reorderCategories(next.map((c) => c.id)).then((result) => {
      if (!result.ok) {
        notify.error(result.error);
        router.refresh();
      }
    });
  }

  function handleProductDrop(targetId: string) {
    const draggedId = draggedProductId;
    setDraggedProductId(null);
    if (!draggedId || draggedId === targetId) return;

    const dragged = products.find((p) => p.id === draggedId);
    const target = products.find((p) => p.id === targetId);
    if (!dragged || !target || dragged.category_id !== target.category_id) return;

    const from = products.findIndex((p) => p.id === draggedId);
    const to = products.findIndex((p) => p.id === targetId);
    const next = [...products];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setProducts(next);

    const categoryProductIds = next
      .filter((p) => p.category_id === dragged.category_id)
      .map((p) => p.id);

    reorderProducts(categoryProductIds).then((result) => {
      if (!result.ok) {
        notify.error(result.error);
        router.refresh();
      }
    });
  }

  /**
   * Alternativa accesible al arrastre: mueve una categoría un puesto
   * arriba/abajo con teclado (WCAG 2.5.7 — el drag-and-drop nunca debe
   * ser la única forma de reordenar).
   */
  function handleCategoryMove(id: string, direction: "up" | "down") {
    const index = categories.findIndex((c) => c.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= categories.length) return;

    const next = [...categories];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setCategories(next);

    reorderCategories(next.map((c) => c.id)).then((result) => {
      if (!result.ok) {
        notify.error(result.error);
        router.refresh();
      }
    });
  }

  /** Misma idea que `handleCategoryMove`, pero dentro de una categoría. */
  function handleProductMove(id: string, direction: "up" | "down") {
    const dragged = products.find((p) => p.id === id);
    if (!dragged) return;

    const siblings = products.filter((p) => p.category_id === dragged.category_id);
    const posInGroup = siblings.findIndex((p) => p.id === id);
    const targetPos = direction === "up" ? posInGroup - 1 : posInGroup + 1;
    if (targetPos < 0 || targetPos >= siblings.length) return;
    const target = siblings[targetPos];

    const from = products.findIndex((p) => p.id === id);
    const to = products.findIndex((p) => p.id === target.id);
    const next = [...products];
    [next[from], next[to]] = [next[to], next[from]];
    setProducts(next);

    const categoryProductIds = next
      .filter((p) => p.category_id === dragged.category_id)
      .map((p) => p.id);

    reorderProducts(categoryProductIds).then((result) => {
      if (!result.ok) {
        notify.error(result.error);
        router.refresh();
      }
    });
  }

  const uncategorized = useMemo(
    () => products.filter((p) => !p.category_id),
    [products]
  );

  const stats = useMemo(() => {
    const available = products.filter((p) => p.available).length;
    return {
      categories: categories.length,
      available,
      unavailable: products.length - available,
    };
  }, [categories, products]);

  return (
    <div className="flex flex-col gap-6 px-4 pb-12 md:px-8">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-6 items-center rounded-badge bg-success-soft px-2.5 text-meta font-medium text-success-soft-foreground">
          {stats.available} disponibles
        </span>
        <span className="inline-flex h-6 items-center rounded-badge bg-secondary px-2.5 text-meta font-medium text-muted-foreground">
          {stats.unavailable} no disponibles
        </span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div className="divide-y divide-border">
          {categories.map((category, index) => (
            <CategoryAdminSection
              key={category.id}
              category={category}
              products={products.filter((p) => p.category_id === category.id)}
              allCategories={categories}
              allProducts={products}
              restaurantId={restaurantId}
              isDragging={draggedCategoryId === category.id}
              onCategoryDragStart={() => setDraggedCategoryId(category.id)}
              onCategoryDragEnd={() => setDraggedCategoryId(null)}
              onCategoryDrop={() => handleCategoryDrop(category.id)}
              onCategoryMoveUp={() => handleCategoryMove(category.id, "up")}
              onCategoryMoveDown={() => handleCategoryMove(category.id, "down")}
              isFirstCategory={index === 0}
              isLastCategory={index === categories.length - 1}
              draggedProductId={draggedProductId}
              onProductDragStart={setDraggedProductId}
              onProductDragEnd={() => setDraggedProductId(null)}
              onProductDrop={handleProductDrop}
              onProductMove={handleProductMove}
            />
          ))}

          {uncategorized.length > 0 && (
            <CategoryAdminSection
              category={null}
              products={uncategorized}
              allCategories={categories}
              allProducts={products}
              restaurantId={restaurantId}
              isDragging={false}
              draggedProductId={draggedProductId}
              onProductDragStart={setDraggedProductId}
              onProductDragEnd={() => setDraggedProductId(null)}
              onProductDrop={handleProductDrop}
              onProductMove={handleProductMove}
            />
          )}
        </div>
      </div>
    </div>
  );
}
