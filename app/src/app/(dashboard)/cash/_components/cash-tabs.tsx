"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { segmentedItemClass, segmentedListClass } from "@/components/shared/segmented-classes";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cash/cortes", label: "Cortes de caja" },
  { href: "/cash/movimientos", label: "Entradas y salidas" },
];

/**
 * Navegación del historial de Caja. Ya no es la portada: Caja abre en el
 * punto de venta y el historial queda detrás de "Historial", con un
 * "Volver a Caja" siempre a la vista.
 */
export function CashTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Historial de caja" className="flex flex-wrap items-center gap-3 overflow-x-auto px-4 pb-4 md:px-8">
      <Link
        href="/cash"
        className="flex min-h-12 items-center gap-2 rounded-button px-3 text-body-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <ArrowLeft className="size-4" aria-hidden /> Volver a Caja
      </Link>
      <div className={segmentedListClass("min-w-max")}>
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
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
