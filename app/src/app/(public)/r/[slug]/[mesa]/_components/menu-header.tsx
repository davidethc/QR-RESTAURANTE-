import Image from "next/image";
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
    <header className="flex items-center gap-3 bg-[oklch(0.38_0.105_140)] px-4 py-3.5 text-white">
      {restaurant.logo_url && (
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/25">
          <Image
            src={restaurant.logo_url}
            alt={restaurant.name}
            fill
            sizes="36px"
            className="object-cover"
          />
        </div>
      )}

      <h1 className="font-display min-w-0 flex-1 truncate text-[20px] font-bold leading-tight">
        {restaurant.name}
      </h1>

      {tableNumber !== null && (
        <span className="flex shrink-0 items-baseline gap-1.5 rounded-lg bg-honey px-2.5 py-1 text-honey-foreground">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">
            Mesa
          </span>
          <span className="font-display text-[20px] font-bold leading-none">
            {tableNumber}
          </span>
        </span>
      )}
    </header>
  );
}
