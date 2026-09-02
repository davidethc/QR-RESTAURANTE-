"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ClipboardList, LayoutGrid, ChefHat } from "lucide-react";
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
];

export function DashboardNav({ session }: { session: MyRestaurant }) {
  const pathname = usePathname();
  const initials = (session.user.full_name ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {session.restaurant.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[session.role]}
          </p>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_LINKS.filter((link) => link.roles.includes(session.role)).map(
            (link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            }
          )}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="shrink-0">
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
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
