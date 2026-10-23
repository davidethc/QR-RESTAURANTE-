"use client";

import { canAccessRoute, filterAllowedLinks, getRoles, type PermissionSource, type PermissionRole } from "@/lib/permissions";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  ClipboardList,
  LayoutGrid,
  ChefHat,
  UtensilsCrossed,
  Settings,
  Wallet,
  Home,
  TrendingUp,
  Users,
  BarChart3,
  ShieldCheck,
  Menu,
  PackageX,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";
import type { MyRestaurant } from "@/types/staff";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { useLiveConnected, useLiveCounters } from "./staff-live-provider";
import { formatBadge, navBadgeFor, type StaffCounters } from "@/lib/staff-counters";

const ROLE_LABEL: Record<PermissionRole, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  WAITER: "Mesero",
  KITCHEN: "Cocina",
  CASHIER: "Cajero",
  MEMBERS_ADMIN: "Administrador de miembros",
  BRANCH_MANAGER: "Gestor de sucursal",
  MENU_MANAGER: "Gestor de menú",
};

type NavLink = { href: string; label: string; icon: LucideIcon };

const NAV_GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Operación",
    links: [
      { href: "/today", label: "Hoy", icon: Home },
      { href: "/orders", label: "Pedidos", icon: ClipboardList },
      { href: "/kitchen", label: "Cocina", icon: ChefHat },
      { href: "/tables", label: "Mesas", icon: LayoutGrid },
      { href: "/cash", label: "Caja", icon: Wallet },
      { href: "/availability", label: "Disponibilidad", icon: PackageX },
    ],
  },
  {
    label: "Negocio",
    links: [
      { href: "/sales", label: "Ventas", icon: TrendingUp },
      { href: "/menu", label: "Carta", icon: UtensilsCrossed },
      { href: "/reports", label: "Reportes", icon: BarChart3 },
      { href: "/staff", label: "Personal", icon: Users },
      { href: "/security", label: "Historial de seguridad", icon: ShieldCheck },
    ],
  },
];

const SETTINGS_LINK: NavLink = {
  href: "/settings",
  label: "Configuración",
  icon: Settings,
};

const ALL_LINKS = [...NAV_GROUPS.flatMap((g) => g.links), SETTINGS_LINK];

function NavItem({
  link,
  active,
  compact,
  onNavigate,
  badge = 0,
}: {
  link: NavLink;
  active: boolean;
  /** M09: avisos pendientes de esta sección (0 = sin insignia). */
  badge?: number;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={compact ? link.label : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-2.5 rounded-control px-2.5 text-body-sm font-medium transition-colors duration-150",
        compact && "xl:justify-start justify-center",
        active
          ? "bg-primary-soft text-primary before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      <link.icon className="size-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className={cn(compact && "hidden xl:inline")}>{link.label}</span>
      {badge > 0 && (
        <span
          className={cn(
            "ml-auto grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-tiny font-semibold leading-5 text-white",
            compact && "max-xl:absolute max-xl:right-1 max-xl:top-1 max-xl:ml-0"
          )}
        >
          <span aria-hidden>{formatBadge(badge)}</span>
          <span className="sr-only">{badge} pendientes</span>
        </span>
      )}
    </Link>
  );
}

function NavList({
  role,
  pathname,
  compact,
  onNavigate,
  counters,
}: {
  role: PermissionSource;
  pathname: string;
  counters: StaffCounters;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    links: filterAllowedLinks(role, g.links),
  })).filter((g) => g.links.length > 0);
  const showSettings = canAccessRoute(role, SETTINGS_LINK.href);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {groups.map((group) => (
        <nav key={group.label} aria-label={group.label} className="flex flex-col gap-0.5">
          <p
            className={cn(
              "px-2.5 pb-1.5 text-tiny font-medium uppercase tracking-wider text-muted-foreground",
              compact && "hidden xl:block"
            )}
          >
            {group.label}
          </p>
          {group.links.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              active={pathname.startsWith(link.href)}
              badge={navBadgeFor(link.href, counters)}
              compact={compact}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      ))}
      {showSettings && (
        <nav aria-label="Cuenta" className="mt-auto border-t border-border pt-3">
          <NavItem
            link={SETTINGS_LINK}
            active={pathname.startsWith(SETTINGS_LINK.href)}
            compact={compact}
            onNavigate={onNavigate}
          />
        </nav>
      )}
    </div>
  );
}

function Brand({ session, compact }: { session: MyRestaurant; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-1.5", compact && "justify-center xl:justify-start")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-control bg-primary text-body-sm font-semibold text-primary-foreground">
        {session.restaurant.name.slice(0, 1).toUpperCase()}
      </span>
      <div className={cn("min-w-0", compact && "hidden xl:block")}>
        <p className="truncate text-body-sm font-semibold leading-tight text-foreground">
          {session.restaurant.name}
        </p>
        <p className="text-caption text-muted-foreground">{getRoles(session).map((role) => ROLE_LABEL[role]).join(" · ")}</p>
      </div>
    </div>
  );
}

export function DashboardNav({ session }: { session: MyRestaurant }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initials = (session.user.full_name ?? "?").slice(0, 1).toUpperCase();
  const current = ALL_LINKS.find((l) => pathname.startsWith(l.href));
  const counters = useLiveCounters();
  const connected = useLiveConnected();

  return (
    <>
      <a
        href="#contenido"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Saltar al contenido
      </a>
      {/* Escritorio: barra completa. Tablet: solo iconos. Móvil: cajón. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col gap-6 border-r border-border bg-card px-3 py-4 md:flex xl:w-60 print:hidden">
        <Brand session={session} compact />
        <NavList role={session} pathname={pathname} counters={counters} compact />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-7 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="-ml-1.5 grid size-9 place-items-center rounded-control text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="size-5" strokeWidth={1.75} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-6 px-3 py-4" showCloseButton={false}>
              <SheetTitle className="sr-only">Menú del panel</SheetTitle>
              <Brand session={session} />
              <NavList role={session} pathname={pathname} counters={counters} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <p className="truncate text-meta text-muted-foreground">
            <span className="hidden sm:inline">{session.restaurant.name} / </span>
            <span className="font-medium text-foreground">{current?.label ?? "Panel"}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
        <ConnectionStatus connected={connected} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-full"
              aria-label="Cuenta y cerrar sesión"
            >
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="bg-secondary text-caption font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-body-sm font-medium">{session.user.full_name ?? "Usuario"}</span>
              <span className="text-caption font-normal text-muted-foreground">
                {getRoles(session).map((role) => ROLE_LABEL[role]).join(" · ")} · {session.restaurant.name}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>

    </>
  );
}
