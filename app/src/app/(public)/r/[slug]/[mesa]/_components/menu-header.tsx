import Image from "next/image";
import type { PublicRestaurant } from "@/types/menu";

export function MenuHeader({
  restaurant,
  tableNumber,
}: {
  restaurant: PublicRestaurant;
  tableNumber: number;
}) {
  return (
    <header className="border-b bg-card px-4 pb-5 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {restaurant.logo_url && (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border">
              <Image
                src={restaurant.logo_url}
                alt={restaurant.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {restaurant.description}
              </p>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          Mesa {tableNumber}
        </span>
      </div>
    </header>
  );
}
