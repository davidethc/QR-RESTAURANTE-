import Image from "next/image";
import type { PublicRestaurant } from "@/types/menu";

/**
 * Encabezado de la carta.
 *
 * Es el único bloque de color saturado de toda la pantalla: verde
 * profundo, a sangre, con el nombre en blanco. Antes era una tarjeta
 * blanca con dos círculos borrosos de color al 10% detrás — el truco
 * de "halo con degradado" que no se percibe a esa opacidad y que es de
 * los más reconocibles de una interfaz generada. Un bloque sólido
 * decide algo; un halo invisible no decide nada.
 *
 * Al ser lo primero que se ve, resuelve además el encargo de "blanco
 * con verde": verde arriba, papel abajo, tinta con verde dentro.
 */
export function MenuHeader({
  restaurant,
  tableNumber,
}: {
  restaurant: PublicRestaurant;
  /** null = el cliente no está en una mesa (se llevó la carta a casa
   *  o abrió un link compartido). Sin mesa no se muestra la ficha. */
  tableNumber: number | null;
}) {
  return (
    <header className="bg-[oklch(0.295_0.055_132)] px-4 pb-7 pt-8 text-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {restaurant.logo_url && (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-1 ring-white/25">
              <Image
                src={restaurant.logo_url}
                alt={restaurant.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-[30px] font-semibold leading-[1.05] tracking-tight">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                {restaurant.description}
              </p>
            )}
          </div>
        </div>

        {/* Chapa de mesa: blanca y sólida sobre el verde. Antes era verde
            al 10% sobre blanco y pesaba menos que la descripción del
            local, cuando es el dato que el cliente necesita confirmar. */}
        {tableNumber !== null && (
          <span className="flex shrink-0 flex-col items-center rounded-lg bg-white px-3 py-1.5 leading-none text-[oklch(0.295_0.055_132)]">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-60">
              Mesa
            </span>
            <span className="font-display mt-1 text-[24px] font-semibold leading-none">
              {tableNumber}
            </span>
          </span>
        )}
      </div>
    </header>
  );
}
