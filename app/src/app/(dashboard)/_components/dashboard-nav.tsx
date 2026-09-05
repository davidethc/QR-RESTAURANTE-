"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ClipboardList, LayoutGrid, ChefHat, UtensilsCrossed, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const NAV_LINKS = [
  { href: "/orders", label: "Pedidos", icon: ClipboardList, roles: ["OWNER", "ADMIN", "WAITER"] as UserRole[] },
  { href: "/kitchen", label: "Cocina", icon: ChefHat, roles: ["OWNER", "ADMIN", "KITCHEN"] as UserRole[] },
  { href: "/tables", label: "Mesas", icon: LayoutGrid, roles: ["OWNER", "ADMIN", "WAITER"] as UserRole[] },
  { href: "/menu", label: "Carta", icon: UtensilsCrossed, roles: ["OWNER", "ADMIN"] as UserRole[] },
  { href: "/settings", label: "Configuración", icon: Settings, roles: ["OWNER"] as UserRole[] },
];

export function DashboardNav({ session }: { session: MyRestaurant }) {
  const pathname = usePathname();
  const initials = (session.user.full_name ?? "?").slice(0, 1).toUpperCase();

  return (
    /* Superficie glass 1 de 2 del panel (la otra es la barra de
       pestañas de /orders). No se anima: sobre tablets de gama media
       animar un backdrop-filter es lo que provoca el scroll con
       tirones. */
    <header className="glass sticky top-0 z-20 border-b border-border/50">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="font-display truncate text-[15px] font-semibold leading-tight text-foreground">
            {session.restaurant.name}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {ROLE_LABEL[session.role]}
          </p>
        </div>

        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {NAV_LINKS.filter((link) => link.roles.includes(session.role)).map(
            (link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    // Píldoras: alto de 40px para que sean tocables con
                    // el dedo y con prisa. Solo la activa lleva clay —
                    // es la única "acción" con volumen de la barra.
                    "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200",
                    active
                      ? "clay clay-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary active:bg-secondary"
                  )}
                >
                  <link.icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            }
          )}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="shrink-0 rounded-full">
              <Avatar className="h-10 w-10 border border-border/60">
                <AvatarFallback className="font-display bg-secondary text-[15px] font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-display text-[15px]">
              {session.user.full_name ?? "Usuario"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
