import { Bike, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import type { PlaceKind } from "@/lib/bill-queue";

const ICONS = {
  TABLE: UtensilsCrossed,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Bike,
  DINE_IN: Store,
} as const;

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  TABLE: "Mesa",
  TAKEAWAY: "Para llevar",
  DELIVERY: "Domicilio",
  DINE_IN: "Para comer aquí",
};

/** Icono del tipo de lugar: mesa, para llevar, domicilio, en el local. */
export function PlaceIcon({ kind, className }: { kind: PlaceKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} aria-hidden />;
}
