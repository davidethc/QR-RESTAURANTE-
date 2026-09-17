"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, CircleCheck, CircleSlash } from "lucide-react";
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

    reorderCategories(slug, next.map((c) => c.id)).then((result) => {
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

    reorderProducts(slug, categoryProductIds).then((result) => {
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
    <div className="flex flex-col gap-6 px-4 py-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-950/20">
          <UtensilsCrossed className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted-foreground">Categorías</p>
            <p className="font-display text-lg font-bold text-foreground">
              {stats.categories}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20">
          <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted-foreground">Disponibles</p>
            <p className="font-display text-lg font-bold text-foreground">
              {stats.available}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/20">
          <CircleSlash className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted-foreground">No disponibles</p>
            <p className="font-display text-lg font-bold text-foreground">
              {stats.unavailable}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <CategoryDialog restaurantId={restaurantId} slug={slug} />
      </div>

      {categories.map((category, index) => (
        <CategoryAdminSection
          key={category.id}
          category={category}
          products={products.filter((p) => p.category_id === category.id)}
          allCategories={categories}
          allProducts={products}
          restaurantId={restaurantId}
          slug={slug}
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
          slug={slug}
          isDragging={false}
          draggedProductId={draggedProductId}
          onProductDragStart={setDraggedProductId}
          onProductDragEnd={() => setDraggedProductId(null)}
          onProductDrop={handleProductDrop}
          onProductMove={handleProductMove}
        />
      )}
    </div>
  );
}
