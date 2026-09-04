import Image from "next/image";
import type { PublicRestaurant } from "@/types/menu";

/**
 * Encabezado de la carta. El nombre del local va en la serif de
 * display y a buen tamaño: es lo primero que ve el cliente al escanear
 * y define de qué sitio es esta carta. La mesa se muestra como una
 * ficha marcada, no como una etiqueta de sistema — el cliente debe
 * poder confirmar de un vistazo que está pidiendo para SU mesa.
 */
export function MenuHeader({
  restaurant,
  tableNumber,
}: {
  restaurant: PublicRestaurant;
  tableNumber: number;
}) {
  return (
    <header className="relative overflow-hidden border-b border-border/60 bg-card px-4 pb-6 pt-7">
      {/* Halo cálido detrás del nombre: da profundidad sin necesitar
          una foto de portada que el restaurante todavía no subió. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-16 h-44 w-44 rounded-full bg-wine/10 blur-3xl"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {restaurant.logo_url && (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border/70 shadow-sm">
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
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-foreground">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {restaurant.description}
              </p>
            )}
          </div>
        </div>

        <span className="flex shrink-0 flex-col items-center rounded-xl border border-primary/25 bg-primary/10 px-3 py-1.5 leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-primary/70">
            Mesa
          </span>
          <span className="font-display mt-0.5 text-lg font-semibold text-primary">
            {tableNumber}
          </span>
        </span>
      </div>
    </header>
  );
}
