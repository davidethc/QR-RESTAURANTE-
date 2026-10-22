"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { segmentedItemClass, segmentedListClass } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cash", label: "Turno", exact: true },
  { href: "/cash/cortes", label: "Cortes de caja", exact: false },
  { href: "/cash/movimientos", label: "Entradas y retiros", exact: false },
];

/** Navegación entre las tres vistas de Caja. Alto táctil de 44px. */
export function CashTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de caja" className="overflow-x-auto px-4 pb-4 md:px-8">
      <div className={segmentedListClass("min-w-max")}>
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(segmentedItemClass(active, "md"), "min-h-11 px-4 text-body-sm")}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
