"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ShoppingBag, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CartSheetV2 } from "./cart-sheet-v2";
import { ProductCard } from "./product-card-v2";
import type { CartItem, PublicProduct, PublicCategory } from "@/types/menu";

interface MenuBrowserV2Props {
  categories: PublicCategory[];
  slug: string;
  tableNumber: number | null;
  restaurantName: string;
  whatsappPhone: string | null;
  suggestedProducts?: PublicProduct[];
}

export function MenuBrowserV2({
  categories,
  slug,
  tableNumber,
  restaurantName,
  whatsappPhone,
  suggestedProducts = [],
}: MenuBrowserV2Props) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);

  // Memoize calculations
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.subtotal, 0),
    [cart]
  );

  const allProducts = useMemo(
    () => categories.flatMap((cat) => cat.products),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) {
      return categories;
    }
    const query = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        products: cat.products.filter(
          (p: PublicProduct) =>
            p.name.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        ),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [categories, searchQuery]);

  // Memoized handlers with useCallback
  const handleAddProduct = useCallback((product: PublicProduct) => {
    setCart((prevCart) => {
      const existing = prevCart.findIndex((item) => item.product.id === product.id);
      if (existing >= 0) {
        const updated = [...prevCart];
        updated[existing] = {
          ...updated[existing],
          quantity: updated[existing].quantity + 1,
          subtotal: (updated[existing].quantity + 1) * product.price,
        };
        return updated;
      }
      return [
        ...prevCart,
        {
          product,
          quantity: 1,
          subtotal: product.price,
          notes: "",
        },
      ];
    });
  }, []);

  const handleUpdateQuantity = useCallback((index: number, quantity: number) => {
    setCart((prevCart) => {
      if (quantity <= 0) {
        return prevCart.filter((_, i) => i !== index);
      }
      const updated = [...prevCart];
      const item = updated[index];
      updated[index] = {
        ...item,
        quantity,
        subtotal: quantity * item.product.price,
      };
      return updated;
    });
  }, []);

  const handleRemoveItem = useCallback((index: number) => {
    setCart((prevCart) => prevCart.filter((_, i) => i !== index));
  }, []);

  const handleClearCart = useCallback(() => {
    setCart([]);
  }, []);

  const handleAddSuggestion = useCallback(
    (product: PublicProduct) => {
      handleAddProduct(product);
      setCartOpen(true);
    },
    [handleAddProduct]
  );

  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  return (
    <>
      <div className="flex min-h-full flex-col">
        {/* Search Header */}
        <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar platos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 rounded-lg bg-muted"
                aria-label="Buscar en el menú"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setSearchQuery("")}
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Cart Button */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setCartOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-label={`Abrir carrito, ${itemCount} items`}
              aria-badge={itemCount > 0 ? itemCount : undefined}
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground"
                >
                  {itemCount}
                </motion.span>
              )}
            </motion.button>
          </div>
        </div>

        {/* Categories Tabs */}
        {filteredProducts.length > 0 && (
          <div className="sticky top-[56px] z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="no-scrollbar -mx-4 flex overflow-x-auto px-4">
              {filteredProducts.map((category, idx) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(idx)}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeCategory === idx
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  role="tab"
                  aria-selected={activeCategory === idx}
                  aria-label={`Categoría ${category.name}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-foreground">
                  No encontramos nada
                </p>
                <p className="text-sm text-muted-foreground">
                  Intenta con otra búsqueda
                </p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`category-${filteredProducts[activeCategory]?.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="px-4 py-4"
              >
                <div className="mb-3">
                  <h2 className="font-display text-lg font-bold">
                    {filteredProducts[activeCategory]?.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {filteredProducts[activeCategory]?.description}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts[activeCategory]?.products.map((product: PublicProduct) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAdd={handleAddProduct}
                      aria-label={`Agregar ${product.name} al carrito`}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Cart Sheet */}
      <CartSheetV2
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={cart}
        total={total}
        onUpdateQuantity={handleUpdateQuantity}
        onRemove={handleRemoveItem}
        onClearCart={handleClearCart}
        slug={slug}
        tableNumber={tableNumber}
        restaurantName={restaurantName}
        whatsappPhone={whatsappPhone}
        suggestedProducts={suggestedProducts.filter(
          (p) => !cart.some((item) => item.product.id === p.id)
        )}
        onAddSuggestion={handleAddSuggestion}
      />
    </>
  );
}
