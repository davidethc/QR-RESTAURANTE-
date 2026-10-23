import { ChefHat, ConciergeBell, Crown, ShieldCheck, type LucideIcon } from "lucide-react";
import type { UserRole } from "@/config/constants";
import type { PosTone } from "@/components/shared/pos-tone";

export const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  WAITER: "Mesero",
  KITCHEN: "Cocina",
};

export const ROLE_HINT: Record<UserRole, string> = {
  OWNER: "Todo, incluido el cobro y la configuración.",
  ADMIN: "Pedidos, mesas, caja, carta, ventas y personal.",
  WAITER: "Pedidos y mesas. No cobra.",
  KITCHEN: "Solo la pantalla de cocina.",
};

/** Icono del rol: el mismo en la ficha del miembro y en los formularios. */
export const ROLE_ICON: Record<UserRole, LucideIcon> = {
  OWNER: Crown,
  ADMIN: ShieldCheck,
  WAITER: ConciergeBell,
  KITCHEN: ChefHat,
};

export const ROLE_TONE: Record<UserRole, PosTone> = {
  OWNER: "money-in",
  ADMIN: "info",
  WAITER: "attention",
  KITCHEN: "neutral",
};

/** Roles combinables (restaurant_members.roles) que no son el rol principal. */
export const EXTRA_ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  MEMBERS_ADMIN: "Admin. de miembros",
  BRANCH_MANAGER: "Gestor de sucursal",
  MENU_MANAGER: "Gestor de menú",
  CASHIER: "Cajero",
  WAITER: "Mesero",
  KITCHEN: "Cocinero",
};

export type AssignableRole = Exclude<UserRole, "OWNER">;
