import Image from "next/image";
import { MapPin, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicRestaurant } from "@/types/menu";

/** Open/closed chip of the digital menu. */
export interface MenuHeaderStatus {
  open: boolean;
  label: string;
}

/**
 * Menu hero: the restaurant's cover photo (when it has one) under a
 * gradient, its logo, name and one line of context.
 *
 * Without a cover it stays the green band of the brand, a little taller
 * than a toolbar so the screen opens on the restaurant, not on a form.
 * The table plate is the only point of the app where green and honey
 * touch: an accent works while it stays scarce.
 */
export function MenuHeader({
  restaurant,
  tableNumber,
  status,
  info,
}: {
  restaurant: PublicRestaurant;
  /** null = not at a table (shared link, digital menu). No plate then. */
  tableNumber: number | null;
  status?: MenuHeaderStatus;
  /** One short line under the name. Defaults to the restaurant's address. */
  info?: string | null;
}) {
  const cover = restaurant.cover_image_url;
  const line = info === undefined ? restaurant.address : info;

  return (
    <header className="relative isolate overflow-hidden bg-primary-dark text-primary-dark-foreground">
      {cover && (
        <>
          <Image
            src={cover}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="-z-10 object-cover"
          />
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-t from-primary-dark via-primary-dark/70 to-primary-dark/10"
          />
        </>
      )}

      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl items-end gap-3.5 px-4 pb-4",
          cover ? "min-h-[184px] pt-16" : "pt-5"
        )}
      >
        {restaurant.logo_url && (
          <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-card shadow-md ring-2 ring-white/30">
            <Image
              src={restaurant.logo_url}
              alt={restaurant.name}
              fill
              sizes="56px"
              // First thing on screen and part of LCP.
              priority
              className="object-cover"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-display text-title-lg font-bold leading-tight tracking-[-0.02em] text-balance">
            {restaurant.name}
          </h1>
          {(status || line) && (
            <p className="flex min-w-0 items-center gap-2 text-meta text-primary-dark-foreground/85">
              {status && (
                <span
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption font-semibold",
                    status.open ? "bg-white/15 text-primary-dark-foreground" : "bg-black/25 text-primary-dark-foreground/90"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-full", status.open ? "bg-honey" : "bg-primary-dark-foreground/50")}
                  />
                  {status.label}
                </span>
              )}
              {line && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">{line}</span>
                </span>
              )}
            </p>
          )}
        </div>

        {tableNumber !== null && (
          <span className="flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-honey px-3 py-1.5 text-honey-foreground">
            <UtensilsCrossed aria-hidden className="size-4" strokeWidth={2.5} />
            <span className="text-caption font-bold">Mesa</span>
            <span className="font-display text-title font-bold leading-none tabular-nums">{tableNumber}</span>
          </span>
        )}
      </div>
    </header>
  );
}
