"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, LayoutGrid, SlidersHorizontal, Tag } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ModifierBoard } from "./modifier-board";

type Tab = "products" | "modifiers" | "promotions";

/**
 * Carta with Caja's identity: a white header band (title, metric tiles,
 * actions), then Productos / Personalizaciones / Promociones as a segmented
 * control.
 */
export function CatalogTabs({
  restaurantId,
  metrics,
  action,
  promotions,
  children,
}: {
  restaurantId: string;
  metrics: ReactNode;
  action: ReactNode;
  /** Promociones tab (M13); its own "Nueva promoción" lives inside it. */
  promotions: ReactNode;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("products");
  return (
    <>
      <section aria-label="Resumen de la carta" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3 max-md:w-full">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-body font-semibold leading-tight text-foreground">Carta</h1>
            <p className="text-meta leading-tight text-muted-foreground">Toca un producto para editarlo</p>
          </div>
        </div>
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-stretch gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:border-l md:border-border md:px-0 md:pl-4">
          {metrics}
        </div>
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:ml-auto md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:px-0 [&>*]:shrink-0">
          {action}
        </div>
      </section>

      <div className="flex flex-col gap-5 px-4 py-4 md:px-5">
        <SegmentedControl<Tab>
          aria-label="Secciones de la carta"
          value={tab}
          onValueChange={setTab}
          className="[&>button]:h-10 [&>button]:px-4 [&>button]:text-body-sm"
          options={[
            { value: "products", label: "Productos", icon: LayoutGrid },
            { value: "modifiers", label: "Personalizaciones", icon: SlidersHorizontal },
            { value: "promotions", label: "Promociones", icon: Tag },
          ]}
        />
        {tab === "products" ? children : tab === "modifiers" ? <ModifierBoard restaurantId={restaurantId} /> : promotions}
      </div>
    </>
  );
}
