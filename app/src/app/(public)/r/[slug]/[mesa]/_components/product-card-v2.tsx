"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

interface ProductCardV2Props {
  product: PublicProduct;
  onAdd: (product: PublicProduct) => void;
  "aria-label"?: string;
}

export function ProductCard({
  product,
  onAdd,
  "aria-label": ariaLabel,
}: ProductCardV2Props) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onAdd(product)}
      className="group flex flex-col gap-2 rounded-2xl border-2 border-border bg-card p-3 text-left transition-all hover:border-primary/50 hover:shadow-md active:bg-muted"
      aria-label={
        ariaLabel ||
        `Agregar ${product.name} a carrito, precio ${formatPrice(product.price)}`
      }
      role="button"
      tabIndex={0}
    >
      {/* Image (optional) */}
      {product.image_url && (
        <div className="relative h-24 w-full overflow-hidden rounded-xl bg-muted">
          <Image
            src={product.image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}

      {/* Name & Description */}
      <div className="flex-1">
        <p className="font-display font-bold text-foreground line-clamp-2">
          {product.name}
        </p>
        {product.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}
      </div>

      {/* Price & Add Button */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          <p className="font-display text-lg font-bold text-primary">
            {formatPrice(product.price)}
          </p>
        </div>

        {/* Add Button */}
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground group-hover:shadow-lg"
        >
          <Plus className="h-5 w-5" />
        </motion.div>
      </div>
    </motion.button>
  );
}
