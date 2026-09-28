import type { UserRole } from "@/config/constants";

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

export type AssignableRole = Exclude<UserRole, "OWNER">;
