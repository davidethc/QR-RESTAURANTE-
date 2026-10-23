import { Bike, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import type { KitchenTicket } from "@/lib/kds";

/** Icono del tipo de servicio, con la misma familia que usa Caja. */
export function KitchenPlaceIcon({ ticket, className }: { ticket: KitchenTicket; className?: string }) {
  const Icon =
    ticket.service_type === "DELIVERY"
      ? Bike
      : ticket.service_type === "TAKEAWAY"
        ? ShoppingBag
        : ticket.table_number != null
          ? UtensilsCrossed
          : Store;
  return <Icon className={className} aria-hidden />;
}
