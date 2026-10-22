/** Permisos de navegación y capacidades de M00 §6. La base conserva su propia autorización. */
export const ROLE_PERMISSIONS = {
  OWNER: ["*"],
  ADMIN: ["*"],
  MEMBERS_ADMIN: ["home", "members.manage"],
  BRANCH_MANAGER: ["home", "branch.edit"],
  MENU_MANAGER: ["home", "menu.manage", "availability.edit"],
  CASHIER: ["home", "pos", "orders.attend", "cash.manage", "sales.summary", "availability.edit", "digitalMenu.view", "printing.manage"],
  WAITER: ["home", "tables", "orders.attend", "availability.edit", "digitalMenu.view", "printing.manage"],
  KITCHEN: ["home", "kitchen", "availability.edit", "printing.manage"],
} as const;

export type PermissionRole = keyof typeof ROLE_PERMISSIONS;
export type Permission = Exclude<(typeof ROLE_PERMISSIONS)[PermissionRole][number], "*"> |
  "sales.view" | "reports.view" | "inventory.manage" | "members.manageAdmins" | "branch.create" | "branch.delete";
export type PermissionSource = string | readonly string[] | {
  role?: string | null;
  roles?: readonly string[] | null;
} | null | undefined;

export function getRoles(source: PermissionSource): PermissionRole[] {
  if (!source) return [];
  const member = typeof source === "object" && !Array.isArray(source)
    ? source as { role?: string | null; roles?: readonly string[] | null }
    : null;
  // OWNER no es asignable en roles[]: lo identifica exclusivamente el campo legacy.
  if (source === "OWNER" || member?.role === "OWNER") return ["OWNER"];
  const values = typeof source === "string" ? [source]
    : member ? member.roles ?? (member.role ? [member.role] : [])
    : source as readonly string[];
  return [...new Set(values)].filter((role): role is PermissionRole =>
    role !== "OWNER" && Object.hasOwn(ROLE_PERMISSIONS, role));
}

export function hasPermission(source: PermissionSource, permission: Permission): boolean {
  return getRoles(source).some((role) => {
    const permissions: readonly string[] = ROLE_PERMISSIONS[role];
    return permissions.includes("*") || permissions.includes(permission);
  });
}

export function canHandleMoney(source: PermissionSource): boolean {
  return hasPermission(source, "cash.manage");
}

/** Compatibilidad con los consumidores legacy; no convierte gestores parciales en ADMIN. */
export function isManager(source: PermissionSource): boolean {
  return getRoles(source).some((role) => role === "OWNER" || role === "ADMIN");
}

export const ROUTE_PERMISSIONS: Readonly<Record<string, Permission>> = {
  "/today": "home",
  // Desviación temporal de la spec §6 hasta que /tables cubra aceptar pedidos QR y atender llamadas.
  "/orders": "orders.attend",
  "/tables": "tables",
  "/kitchen": "kitchen",
  "/menu": "menu.manage",
  "/cash": "cash.manage",
  "/staff": "members.manage",
  "/sales": "sales.view",
  "/reports": "reports.view",
  "/inventory": "inventory.manage",
  "/settings": "branch.edit",
  "/security": "members.manageAdmins",
  // Rutas especificadas en M02/M16, todavía sin páginas en esta rama.
  "/disponibilidad": "availability.edit",
  "/availability": "availability.edit",
  "/ajustes/impresion": "printing.manage",
};

function routePermission(path: string): Permission | undefined {
  const pathname = path.split(/[?#]/, 1)[0];
  const route = Object.keys(ROUTE_PERMISSIONS).find((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`));
  return route ? ROUTE_PERMISSIONS[route] : undefined;
}

export function canAccessRoute(source: PermissionSource, path: string): boolean {
  const permission = routePermission(path);
  return permission !== undefined && hasPermission(source, permission);
}

export function getLandingPath(source: PermissionSource): string {
  const roles = getRoles(source);
  if (isManager(source)) return "/today";
  for (const role of roles) {
    if (role === "WAITER") return "/tables";
    if (role === "CASHIER") return "/orders";
    if (role === "KITCHEN") return "/kitchen";
  }
  return hasPermission(source, "home") ? "/today" : "/login";
}

export function getRouteRedirect(source: PermissionSource, path: string): string | null {
  if (canAccessRoute(source, path)) return null;
  if (!hasPermission(source, "home")) return "/login";
  const permission = routePermission(path);
  return permission === "orders.attend" || permission === "tables" || permission === "kitchen"
    ? getLandingPath(source) : "/today";
}

export function filterAllowedLinks<T extends { href: string }>(source: PermissionSource, links: readonly T[]): T[] {
  return links.filter((link) => canAccessRoute(source, link.href));
}
