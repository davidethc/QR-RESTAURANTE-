import Image from "next/image";
import { Plus } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, cn } from "@/lib/utils";
import type { PublicProduct } from "@/types/menu";

/**
 * Tarjeta compacta para las filas horizontales de cada categoría.
 *
 * Sin foto NO se dibuja el hueco de la foto. Antes se rellenaba con un
 * degradado y el emoji de la categoría, y el resultado eran seis
 * bloques grises idénticos ocupando la mitad de cada tarjeta para no
 * decir nada — se leía como fotos que no cargaron. Sin ese hueco la
 * tarjeta es puro texto y se sostiene sola; cuando el restaurante suba
 * la foto, aparece encima y la tarjeta crece.
 */
export function ProductCardCompact({
  product,
  onSelect,
  quantityInCart = 0,
}: {
  product: PublicProduct;
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
        "group flex w-[158px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card text-left",
        soldOut ? "opacity-55" : "cursor-pointer active:bg-muted"
      )}
    >
      {product.image_url && (
        <div className="relative h-[92px] w-full overflow-hidden bg-muted">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="158px"
            className="object-cover"
          />
        </div>
      )}

      <div className="relative flex flex-1 flex-col gap-1 p-3">
        {quantityInCart > 0 && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-primary px-1.5 py-0.5 text-[10.5px] font-bold leading-tight text-primary-foreground">
            {quantityInCart}
          </span>
        )}
        <h3 className="font-display line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">
          {product.name}
        </h3>
        {product.description && (
          <p className="line-clamp-3 text-[11.5px] leading-snug text-muted-foreground">
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
        "group relative flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left transition-colors duration-200",
        soldOut ? "opacity-55" : "cursor-pointer active:bg-muted"
      )}
    >
      {product.image_url && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center clay clay-primary rounded-full bg-primary text-primary-foreground">
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </div>
      )}
    </article>
  );
}
