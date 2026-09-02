"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProductCard } from "./product-card";
import type { PublicCategory } from "@/types/menu";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function MenuBrowser({ categories }: { categories: PublicCategory[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;

    return categories.flatMap((category) =>
      category.products
        .filter((product) => normalize(product.name).includes(q))
        .map((product) => ({ ...product, categoryName: category.name }))
    );
  }, [categories, query]);

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en la carta"
          className="pl-9"
        />
      </div>

      {results === null ? (
        <>
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {categories.map((category) => (
              <a
                key={category.id}
                href={`#cat-${category.id}`}
                className="shrink-0 rounded-full border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"
              >
                {category.name}
              </a>
            ))}
          </nav>

          {categories.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              className="scroll-mt-4"
            >
              <h2 className="mb-2 text-base font-semibold text-foreground">
                {category.name}
              </h2>
              <div className="flex flex-col gap-2">
                {category.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}
        </>
      ) : results.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No encontramos productos con &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
