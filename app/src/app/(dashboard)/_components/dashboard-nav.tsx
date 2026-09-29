"use client";

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
  Menu,
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
import type { UserRole } from "@/config/constants";
import type { MyRestaurant } from "@/types/staff";

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  WAITER: "Mesero",
  KITCHEN: "Cocina",
};

const MANAGERS: UserRole[] = ["OWNER", "ADMIN"];

type NavLink = { href: string; label: string; icon: LucideIcon; roles: UserRole[] };

const NAV_GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Operación",
    links: [
      { href: "/today", label: "Hoy", icon: Home, roles: MANAGERS },
      { href: "/orders", label: "Pedidos", icon: ClipboardList, roles: ["OWNER", "ADMIN", "WAITER"] },
      { href: "/kitchen", label: "Cocina", icon: ChefHat, roles: ["OWNER", "ADMIN", "KITCHEN"] },
      { href: "/tables", label: "Mesas", icon: LayoutGrid, roles: ["OWNER", "ADMIN", "WAITER"] },
      { href: "/cash", label: "Caja", icon: Wallet, roles: MANAGERS },
    ],
  },
  {
    label: "Negocio",
    links: [
      { href: "/sales", label: "Ventas", icon: TrendingUp, roles: MANAGERS },
      { href: "/menu", label: "Carta", icon: UtensilsCrossed, roles: MANAGERS },
      { href: "/reports", label: "Reportes", icon: BarChart3, roles: MANAGERS },
      { href: "/staff", label: "Personal", icon: Users, roles: MANAGERS },
    ],
  },
];

const SETTINGS_LINK: NavLink = {
  href: "/settings",
  label: "Configuración",
  icon: Settings,
  roles: MANAGERS,
};

const ALL_LINKS = [...NAV_GROUPS.flatMap((g) => g.links), SETTINGS_LINK];

function NavItem({
  link,
  active,
  compact,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
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
        "relative flex h-9 items-center gap-2.5 rounded-control px-2.5 text-body-sm font-medium transition-colors duration-150",
        compact && "xl:justify-start justify-center",
        active
          ? "bg-primary-soft text-primary before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      <link.icon className="size-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className={cn(compact && "hidden xl:inline")}>{link.label}</span>
    </Link>
  );
}

function NavList({
  role,
  pathname,
  compact,
  onNavigate,
}: {
  role: UserRole;
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => l.roles.includes(role)),
  })).filter((g) => g.links.length > 0);
  const showSettings = SETTINGS_LINK.roles.includes(role);

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
        <p className="text-caption text-muted-foreground">{ROLE_LABEL[session.role]}</p>
      </div>
    </div>
  );
}

export function DashboardNav({ session }: { session: MyRestaurant }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initials = (session.user.full_name ?? "?").slice(0, 1).toUpperCase();
  const current = ALL_LINKS.find((l) => pathname.startsWith(l.href));

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
        <NavList role={session.role} pathname={pathname} compact />
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
              <NavList role={session.role} pathname={pathname} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <p className="truncate text-meta text-muted-foreground">
            <span className="hidden sm:inline">{session.restaurant.name} / </span>
            <span className="font-medium text-foreground">{current?.label ?? "Panel"}</span>
          </p>
        </div>

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
                {ROLE_LABEL[session.role]} · {session.restaurant.name}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

    </>
  );
}
