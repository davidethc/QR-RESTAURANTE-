"use client";

import { useMemo, useState } from "react";
import { BookOpen, Plus, Search, SearchX, X } from "lucide-react";
import { CategoryDialog } from "./category-dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { posPressable } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
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
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string>("all");

  // router.refresh() trae props nuevas (otro cambio, un producto creado):
  // el estado local las adopta en vez de quedarse con la copia inicial.
  const [seenCategories, setSeenCategories] = useState(initialCategories);
  const [seenProducts, setSeenProducts] = useState(initialProducts);
  if (seenCategories !== initialCategories) {
    setSeenCategories(initialCategories);
    setCategories(initialCategories);
  }
  if (seenProducts !== initialProducts) {
    setSeenProducts(initialProducts);
    setProducts(initialProducts);
  }

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

  const q = query.trim().toLowerCase();
  const matches = (p: AdminProduct) =>
    !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
  const searching = q.length > 0;
  const visibleCategories = categories.filter((c) => focus === "all" || focus === c.id);
  const showUncategorized = uncategorized.length > 0 && (focus === "all" || focus === "none");
  const sectionProps = {
    allCategories: categories,
    allProducts: products,
    restaurantId,
    draggedProductId,
    onProductDragStart: setDraggedProductId,
    onProductDragEnd: () => setDraggedProductId(null),
    onProductDrop: handleProductDrop,
    onProductMove: handleProductMove,
  };

  const sections = [
    ...visibleCategories.map((category) => {
      const index = categories.indexOf(category);
      const items = products.filter((p) => p.category_id === category.id && matches(p));
      if (searching && items.length === 0) return null;
      return (
        <CategoryAdminSection
          key={category.id}
          {...sectionProps}
          category={category}
          products={items}
          isDragging={draggedCategoryId === category.id}
          onCategoryDragStart={() => setDraggedCategoryId(category.id)}
          onCategoryDragEnd={() => setDraggedCategoryId(null)}
          onCategoryDrop={() => handleCategoryDrop(category.id)}
          onCategoryMoveUp={() => handleCategoryMove(category.id, "up")}
          onCategoryMoveDown={() => handleCategoryMove(category.id, "down")}
          isFirstCategory={index === 0}
          isLastCategory={index === categories.length - 1}
        />
      );
    }),
    showUncategorized && (!searching || uncategorized.some(matches)) ? (
      <CategoryAdminSection
        key="none"
        {...sectionProps}
        category={null}
        products={uncategorized.filter(matches)}
        isDragging={false}
      />
    ) : null,
  ].filter(Boolean);

  const chips = [
    { id: "all", label: "Todas", count: products.length },
    ...categories.map((c) => ({
      id: c.id,
      label: c.name,
      count: products.filter((p) => p.category_id === c.id).length,
    })),
    ...(uncategorized.length > 0 ? [{ id: "none", label: "Sin categoría", count: uncategorized.length }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative w-full lg:w-72 lg:shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar producto"
            className="h-12 pl-9"
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Ver categoría"
          className="-mx-3 flex min-w-0 gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-1 lg:px-0"
        >
          {chips.map((chip) => {
            const active = focus === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFocus(chip.id)}
                className={cn(
                  posPressable,
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-semibold whitespace-nowrap",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:border-border-strong"
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-caption tabular-nums",
                    active ? "bg-background/20 text-background" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {categories.length === 0 && products.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-border bg-card">
          <EmptyState
            icon={BookOpen}
            title="Tu carta está vacía"
            description="Empieza con una categoría (ej. Bebidas, Platos fuertes) y luego agrega sus productos."
            action={
              <CategoryDialog
                restaurantId={restaurantId}
                trigger={
                  <button type="button" className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button bg-foreground px-5 text-body font-semibold text-background hover:bg-foreground/90")}>
                    <Plus className="size-4" aria-hidden /> Crear la primera categoría
                  </button>
                }
              />
            }
          />
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-card border border-border bg-card">
          <EmptyState
            icon={SearchX}
            title="Ningún producto coincide"
            description={`No encontramos “${query.trim()}” en esta vista.`}
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFocus("all");
                }}
                className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold hover:border-border-strong")}
              >
                <X className="size-4" aria-hidden /> Limpiar búsqueda
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">{sections}</div>
      )}
    </div>
  );
}
