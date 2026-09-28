import type { UserRole } from "@/config/constants";

/**
 * Quién maneja dinero en el panel: cobrar cuentas, abrir/cerrar caja,
 * movimientos y descuentos. Decisión del negocio (2026-09-27): el mesero
 * toma y lleva pedidos, pero cobra el administrador/dueño.
 */
export function canHandleMoney(role: UserRole | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Quién ve y gestiona al personal, las ventas y la pantalla "Hoy". */
export function isManager(role: UserRole | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}
