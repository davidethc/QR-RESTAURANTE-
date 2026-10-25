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
 * Menu hero: "Sabor Code" in a script face that writes itself in once, with
 * the restaurant's name under it, small and sober, as the page `<h1>`.
 *
 * Without a cover photo it sits on the cream page itself (the old solid
 * green band is gone); with one, the photo goes under a dark gradient and
 * the text turns light. The table plate is the only point where green and
 * honey touch: an accent works while it stays scarce. Server component:
 * the animation is CSS only.
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
    <header
      className={cn(
        "relative isolate overflow-hidden",
        cover ? "bg-primary-dark text-primary-dark-foreground" : "bg-background text-foreground"
      )}
    >
      {cover && (
        <>
          <Image
            src={cover}
            alt=""
            fill
            preload
            sizes="(max-width: 768px) 100vw, 768px"
            className="-z-10 object-cover"
          />
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-t from-primary-dark via-primary-dark/75 to-primary-dark/20"
          />
        </>
      )}

      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl items-end gap-3.5 px-4 pb-3",
          cover ? "min-h-[184px] pt-16" : "pt-6"
        )}
      >
        {restaurant.logo_url && (
          <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-card shadow-md ring-2 ring-white/30">
            <Image
              src={restaurant.logo_url}
              alt={restaurant.name}
              fill
              sizes="56px"
              loading="eager"
              className="object-cover"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <p
            className={cn("sabor-title self-start", cover ? "text-primary-dark-foreground" : "text-primary-dark")}
          >
            Sabor Code
            <span aria-hidden className={cn("sabor-flourish", cover ? "bg-honey" : "bg-honey/80")} />
          </p>
          <h1
            className={cn(
              "mt-1.5 truncate text-body-sm font-semibold uppercase tracking-[0.14em]",
              cover ? "text-primary-dark-foreground/90" : "text-muted-foreground"
            )}
          >
            {restaurant.name}
          </h1>
          {(status || line) && (
            <p
              className={cn(
                "mt-1.5 flex min-w-0 items-center gap-2 text-meta",
                cover ? "text-primary-dark-foreground/85" : "text-muted-foreground"
              )}
            >
              {status && (
                <span
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption font-semibold",
                    cover
                      ? "bg-white/15 text-primary-dark-foreground"
                      : status.open
                        ? "bg-primary-soft text-primary-soft-foreground"
                        : "bg-secondary text-muted-foreground"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-full", status.open ? (cover ? "bg-honey" : "bg-primary") : "bg-current opacity-50")}
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
