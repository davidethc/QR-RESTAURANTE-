import Image from "next/image";
import { Plus } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import type { PublicProduct } from "@/types/menu";

/**
 * Tarjeta compacta para las filas horizontales de cada categoría.
 *
 * Mientras no haya fotos, el hueco de imagen no se deja vacío ni con
 * un ícono de "imagen rota": se llena con un degradado cálido y el
 * emoji de la categoría, que se lee como decisión y no como error.
 * En cuanto el restaurante suba la foto, ocupa ese mismo espacio sin
 * mover nada de sitio.
 */
export function ProductCardCompact({
  product,
  categoryName,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  categoryName: string;
  onSelect?: (product: PublicProduct) => void;
  quantityInCart?: number;
}) {
  const soldOut = !product.available;

  return (
    <article
      role={soldOut ? undefined : "button"}
      tabIndex={soldOut ? undefined : 0}
      onClick={soldOut ? undefined : () => onSelect?.(product)}
      onKeyDown={
        soldOut
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(product);
              }
            }
      }
      className={cn(
        "group flex w-[158px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left",
        soldOut ? "opacity-55" : "shadow-card cursor-pointer"
      )}
    >
      <div className="relative h-[92px] w-full overflow-hidden bg-gradient-to-br from-accent/50 via-secondary to-secondary">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="158px"
            className="object-cover"
          />
        ) : (
          <>
            {/* Sin foto: el emoji va como sello decorativo saliéndose
                de la esquina, no centrado. Centrado y opaco se
                convierte en el protagonista y, como es el mismo para
                toda la categoría, se ven 16 tarjetas idénticas. Como
                marca de agua da textura sin competir con el nombre. */}
            <span
              aria-hidden
              className="absolute -bottom-3 -right-2 select-none text-6xl opacity-[0.13]"
            >
              {getCategoryIcon(categoryName)}
            </span>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px bg-border/50"
            />
          </>
        )}
        {quantityInCart > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold leading-tight text-primary-foreground shadow-sm">
            {quantityInCart}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h3 className="font-display line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">
          {product.name}
        </h3>
        {product.description && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {product.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-1 pt-1.5">
          <span className="font-display text-[15px] font-semibold tabular-nums text-wine">
            {formatPrice(product.price)}
          </span>
          {soldOut ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agotado
            </span>
          ) : (
            <span className="clay clay-primary flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" strokeWidth={2.75} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Un plato de la carta.
 *
 * Decisión de diseño sobre las fotos: cuando un plato no tiene imagen
 * NO se dibuja un recuadro gris con un ícono de cubiertos — eso se lee
 * como una foto rota y ensucia toda la carta. En su lugar la tarjeta
 * se compone como una carta impresa de verdad: el nombre manda, y el
 * precio se alinea a la derecha unido por una línea de puntos. Así la
 * carta se ve terminada hoy (sin fotos) y solo mejora cuando el
 * restaurante suba las suyas.
 */
export function ProductCard({
  product,
  categoryName,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
  /** Solo se pinta en resultados de búsqueda: fuera de su categoría,
   *  "Café con leche" o "Pizza pequeña" necesitan contexto para saber
   *  de dónde salieron. Dentro de una categoría sería ruido. */
  categoryName?: string;
  onSelect?: (product: PublicProduct) => void;
  quantityInCart?: number;
}) {
  const soldOut = !product.available;

  return (
    <article
      role={soldOut ? undefined : "button"}
      tabIndex={soldOut ? undefined : 0}
      onClick={soldOut ? undefined : () => onSelect?.(product)}
      onKeyDown={
        soldOut
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(product);
              }
            }
      }
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 text-left transition-all duration-200",
        soldOut
          ? "opacity-55"
          : "shadow-card cursor-pointer active:scale-[0.99] active:shadow-none"
      )}
    >
      {product.image_url && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-[15px] font-semibold leading-snug text-foreground">
            {product.name}
          </h3>
          {/* Línea de puntos de carta impresa: une nombre y precio sin
              necesitar una foto que llene el espacio. */}
          <span
            aria-hidden
            className="mb-1 min-w-4 flex-1 border-b border-dotted border-border"
          />
          <span className="font-display shrink-0 text-[15px] font-semibold tabular-nums text-wine">
            {formatPrice(product.price)}
          </span>
        </div>

        {product.description && (
          <p className="line-clamp-2 pr-2 text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
          {categoryName && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium leading-tight text-muted-foreground">
              <span aria-hidden>{getCategoryIcon(categoryName)}</span>
              {categoryName}
            </span>
          )}
          {quantityInCart > 0 && (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold leading-tight text-primary">
              {quantityInCart} en tu pedido
            </span>
          )}
          {soldOut && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold leading-tight text-muted-foreground">
              Agotado hoy
            </span>
          )}
        </div>
      </div>

      {!soldOut && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-active:scale-90">
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </div>
      )}
    </article>
  );
}
