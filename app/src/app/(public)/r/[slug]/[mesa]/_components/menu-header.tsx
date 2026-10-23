import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
import type { PublicRestaurant } from "@/types/menu";

/**
 * Encabezado de la carta: una sola franja verde.
 *
 * Antes ocupaba ~140 px (el 15 % de la pantalla) con el nombre, la
 * descripción del local y mucho aire, antes siquiera de que empezara la
 * carta. Ahora es una línea: nombre y chapa de mesa. La descripción del
 * local no ayuda a pedir y era lo que más alto costaba.
 *
 * El verde también se aclaró: estaba en L 0.295, casi negro, y con
 * croma 0.055, casi gris. Ese era el "tono cafetería triste" — no el
 * verde en sí, que es el del logo, sino tenerlo a oscuras.
 *
 * La chapa de mesa es el único punto de toda la app donde el verde y la
 * miel se tocan, y por eso funciona: un acento vale mientras siga
 * siendo escaso.
 */
export function MenuHeader({
  restaurant,
  tableNumber,
}: {
  restaurant: PublicRestaurant;
  /** null = el cliente no está en una mesa (se llevó la carta a casa
   *  o abrió un link compartido). Sin mesa no se muestra la chapa. */
  tableNumber: number | null;
}) {
  return (
    <header className="bg-primary-dark text-primary-dark-foreground">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5">
        {restaurant.logo_url && (
          <div className="relative size-10 shrink-0 overflow-hidden rounded-full ring-2 ring-white/25">
            <Image
              src={restaurant.logo_url}
              alt={restaurant.name}
              fill
              sizes="40px"
              // First thing on screen and part of LCP: without `priority`
              // the browser treats it as a deferred image.
              priority
              className="object-cover"
            />
          </div>
        )}

        <h1 className="font-display min-w-0 flex-1 truncate text-title font-bold leading-tight">
          {restaurant.name}
        </h1>

        {tableNumber !== null && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-honey px-3 py-1.5 text-honey-foreground">
            <UtensilsCrossed aria-hidden className="size-4" strokeWidth={2.5} />
            <span className="text-caption font-bold uppercase tracking-wider">Mesa</span>
            <span className="font-display text-title font-bold leading-none tabular-nums">
              {tableNumber}
            </span>
          </span>
        )}
      </div>
    </header>
  );
}
