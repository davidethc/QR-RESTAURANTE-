"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Search, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import {
  SegmentedControl,
} from "@/components/shared/segmented-control";
import { notify } from "@/lib/notifications";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { setItemAvailability } from "@/lib/actions/availability";
import type { AvailabilityItem } from "@/lib/queries/availability";

const PAGE_SIZE = 20;

type Tab = "all" | "off";

export function AvailabilityList({
  items,
  restaurantId,
}: {
  items: AvailabilityItem[];
  restaurantId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  // Cambios optimistas por clave hasta que llegue el refresco del servidor.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // M09: otro dispositivo cambió la disponibilidad -> estado fresco.
  useStaffRealtime(
    restaurantId,
    () => {
      setOverrides({});
      router.refresh();
    },
    { channelName: "staff-availability", tables: ["availability"] }
  );

  const rows = useMemo(
    () => items.map((i) => ({ ...i, available: overrides[i.key] ?? i.available })),
    [items, overrides]
  );
  const offCount = rows.filter((r) => !r.available).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tab === "all" || !r.available) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          (r.subtitle ?? "").toLowerCase().includes(q))
    );
  }, [rows, tab, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function toggle(item: AvailabilityItem, available: boolean) {
    setOverrides((o) => ({ ...o, [item.key]: available }));
    startTransition(async () => {
      const result = await setItemAvailability({
        itemType: item.itemType,
        itemId: item.itemId,
        available,
      });
      if (!result.ok) {
        setOverrides((o) => ({ ...o, [item.key]: !available }));
        notify.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Tab>
          aria-label="Filtrar por estado"
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setPage(0);
          }}
          options={[
            { value: "all", label: "Todos" },
            { value: "off", label: `No disponibles (${offCount})` },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar ítem"
            aria-label="Buscar ítem"
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border px-4 py-2.5 text-caption font-medium uppercase tracking-wider text-muted-foreground">
          <span>Ítem</span>
          <span>Estado</span>
        </div>
        {visible.length === 0 ? (
          <EmptyState
            title={tab === "off" ? "Nada agotado" : "Sin resultados"}
            description={
              tab === "off"
                ? "Todo está disponible."
                : "Prueba con otra búsqueda o crea variantes en la carta."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((item) => (
              <li
                key={item.key}
                className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-3 px-4 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.itemType === "variant" && (
                    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-control bg-secondary text-muted-foreground">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : (
                        <UtensilsCrossed className="size-4" aria-hidden="true" />
                      )}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="truncate text-caption text-muted-foreground">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                  <span
                    className={
                      item.available
                        ? "text-meta text-foreground"
                        : "text-meta text-muted-foreground"
                    }
                  >
                    {item.available ? "Disponible" : "Desactivado"}
                  </span>
                  <Switch
                    checked={item.available}
                    onCheckedChange={(checked) => toggle(item, checked)}
                    aria-label={`${item.title}: ${item.available ? "Disponible" : "Agotado"}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-meta text-muted-foreground">
          <span>
            {filtered.length === 0
              ? "0 de 0 items"
              : `${start + 1} - ${start + visible.length} de ${filtered.length} items`}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              aria-label="Página siguiente"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
