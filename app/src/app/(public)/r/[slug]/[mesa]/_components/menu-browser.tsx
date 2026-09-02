"use client";

import { useMemo, useRef, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import { CategorySection } from "./category-section";
import { ProductSheet } from "./product-sheet";
import { CartSheet } from "./cart-sheet";
import { ServiceButtons } from "./service-buttons";
import { useCart } from "@/hooks/use-cart";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import type { PublicCategory, PublicProduct } from "@/types/menu";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function MenuBrowser({
  categories,
  slug,
  tableNumber,
}: {
  categories: PublicCategory[];
  slug: string;
  tableNumber: number;
}) {
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.id))
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(
    null
  );
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart(slug, tableNumber);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;

    return categories.flatMap((category) =>
      category.products
        .filter((product) => normalize(product.name).includes(q))
        .map((product) => ({ ...product, categoryName: category.name }))
    );
  }, [categories, query]);

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function goToCategory(id: string) {
    setOpenCategories((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la carta"
            className="pl-9"
          />
        </div>

        {results === null && (
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => goToCategory(category.id)}
                className="shrink-0 rounded-full border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"
              >
                {category.name}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-5 px-4">
        {results === null ? (
          categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              isOpen={openCategories.has(category.id)}
              onToggle={() => toggleCategory(category.id)}
              onSelectProduct={setSelectedProduct}
              sectionRef={(el) => {
                sectionRefs.current[category.id] = el;
              }}
            />
          ))
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No encontramos productos con &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={setSelectedProduct}
              />
            ))}
          </div>
        )}
      </div>

      <ProductSheet
        product={selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        onAdd={(product, quantity, notes) => {
          cart.addItem(product, quantity, notes);
          notify.itemAdded(product.name);
        }}
      />

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={cart.items}
        total={cart.total}
        onUpdateQuantity={cart.updateQuantity}
        onRemove={cart.removeItem}
        onClearCart={cart.clearCart}
        slug={slug}
        tableNumber={tableNumber}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {cart.itemCount > 0 && (
          <Button
            size="lg"
            className="w-full justify-between"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Ver pedido · {cart.itemCount}
            </span>
            <span>{formatPrice(cart.total)}</span>
          </Button>
        )}
        <ServiceButtons tableNumber={tableNumber} />
      </div>
    </div>
  );
}
