"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryAdminSection } from "./category-admin-section";
import { CategoryDialog } from "./category-dialog";
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
  slug,
  categories: initialCategories,
  products: initialProducts,
}: {
  restaurantId: string;
  slug: string;
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

    reorderCategories(slug, next.map((c) => c.id)).then((result) => {
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

    reorderProducts(slug, categoryProductIds).then((result) => {
      if (!result.ok) {
        notify.error(result.error);
        router.refresh();
      }
    });
  }

  const uncategorized = products.filter((p) => !p.category_id);

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <div className="flex justify-end">
        <CategoryDialog restaurantId={restaurantId} slug={slug} />
      </div>

      {categories.map((category) => (
        <CategoryAdminSection
          key={category.id}
          category={category}
          products={products.filter((p) => p.category_id === category.id)}
          allCategories={categories}
          restaurantId={restaurantId}
          slug={slug}
          isDragging={draggedCategoryId === category.id}
          onCategoryDragStart={() => setDraggedCategoryId(category.id)}
          onCategoryDragEnd={() => setDraggedCategoryId(null)}
          onCategoryDrop={() => handleCategoryDrop(category.id)}
          draggedProductId={draggedProductId}
          onProductDragStart={setDraggedProductId}
          onProductDragEnd={() => setDraggedProductId(null)}
          onProductDrop={handleProductDrop}
        />
      ))}

      {uncategorized.length > 0 && (
        <CategoryAdminSection
          category={null}
          products={uncategorized}
          allCategories={categories}
          restaurantId={restaurantId}
          slug={slug}
          isDragging={false}
          draggedProductId={draggedProductId}
          onProductDragStart={setDraggedProductId}
          onProductDragEnd={() => setDraggedProductId(null)}
          onProductDrop={handleProductDrop}
        />
      )}
    </div>
  );
}
