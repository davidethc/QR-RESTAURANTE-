"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  BookOpen,
  Check,
  CheckCircle2,
  PackageCheck,
  Search,
  SearchX,
  SlidersHorizontal,
  UtensilsCrossed,
  X,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { StatusMetric } from "@/components/shared/status-strip";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { notify } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { setItemAvailability } from "@/lib/actions/availability";
import type { AvailabilityItem } from "@/lib/queries/availability";

type Status = "all" | "off" | "on";
type Kind = "variant" | "modifier_option";

const NO_GROUP = "__none__";

/**
 * "What is there today": every product variant and extra as a card with one
 * big toggle. Sold out turns the card red with an icon and the word
 * "Agotado". Filters: search, products vs extras, status, and the category
 * (or extras group) as chips.
 */
export function AvailabilityList({
  items,
  restaurantId,
  canEditMenu,
}: {
  items: AvailabilityItem[];
  restaurantId: string;
  /** Owner/manager: the empty state links to the Carta. */
  canEditMenu: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<Kind>("variant");
  const [status, setStatus] = useState<Status>("all");
  const [group, setGroup] = useState<string>("all");
  const [query, setQuery] = useState("");
  // Cambios optimistas por clave hasta que llegue el refresco del servidor.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

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

  const counts = useMemo(() => {
    const off = rows.filter((r) => !r.available).length;
    return {
      off,
      on: rows.length - off,
      variants: rows.filter((r) => r.itemType === "variant").length,
      options: rows.filter((r) => r.itemType === "modifier_option").length,
      offVariants: rows.filter((r) => r.itemType === "variant" && !r.available).length,
      offOptions: rows.filter((r) => r.itemType === "modifier_option" && !r.available).length,
    };
  }, [rows]);

  const ofKind = useMemo(() => rows.filter((r) => r.itemType === kind), [rows, kind]);

  /** Categories (products) or groups (extras), in first-seen order, with counts. */
  const groups = useMemo(() => {
    const m = new Map<string, { total: number; off: number }>();
    for (const r of ofKind) {
      const k = r.subtitle ?? NO_GROUP;
      const g = m.get(k) ?? { total: 0, off: 0 };
      g.total++;
      if (!r.available) g.off++;
      m.set(k, g);
    }
    return [...m.entries()]
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => groupLabel(a.id, kind).localeCompare(groupLabel(b.id, kind), "es"));
  }, [ofKind, kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofKind.filter(
      (r) =>
        (status === "all" || (status === "off" ? !r.available : r.available)) &&
        (group === "all" || (r.subtitle ?? NO_GROUP) === group) &&
        (!q || r.title.toLowerCase().includes(q) || (r.subtitle ?? "").toLowerCase().includes(q))
    );
  }, [ofKind, status, group, query]);

  const sections = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const k = r.subtitle ?? NO_GROUP;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return groups.filter((g) => m.has(g.id)).map((g) => ({ id: g.id, items: m.get(g.id)! }));
  }, [filtered, groups]);

  function toggle(item: AvailabilityItem, available: boolean) {
    setOverrides((o) => ({ ...o, [item.key]: available }));
    setPending((p) => ({ ...p, [item.key]: true }));
    startTransition(async () => {
      const result = await setItemAvailability({
        itemType: item.itemType,
        itemId: item.itemId,
        available,
      });
      setPending((p) => {
        const next = { ...p };
        delete next[item.key];
        return next;
      });
      if (!result.ok) {
        setOverrides((o) => ({ ...o, [item.key]: !available }));
        notify.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setGroup("all");
  }

  const filtersActive = query.trim() !== "" || status !== "all" || group !== "all";

  return (
    <>
      <section aria-label="Resumen de disponibilidad" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3 max-md:w-full">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <PackageCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-body font-semibold leading-tight text-foreground">Disponibilidad</h1>
            <p className="text-meta leading-tight text-muted-foreground">Marca lo que hoy no hay</p>
          </div>
        </div>
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-stretch gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:border-l md:border-border md:px-0 md:pl-4">
          <StatusMetric label="Disponibles" value={String(counts.on)} tone="money-in" icon={CheckCircle2} />
          <StatusMetric label="Agotados" value={String(counts.off)} tone={counts.off > 0 ? "money-out" : "neutral"} icon={XCircle} />
          <StatusMetric label="Productos" value={String(counts.variants)} icon={UtensilsCrossed} />
          <StatusMetric label="Extras" value={String(counts.options)} tone="info" icon={SlidersHorizontal} />
        </div>
      </section>

      <div className="flex flex-col gap-5 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Kind>
              aria-label="Qué ver"
              value={kind}
              onValueChange={(v) => {
                setKind(v);
                setGroup("all");
              }}
              className="[&>button]:h-10 [&>button]:px-4 [&>button]:text-body-sm"
              options={[
                { value: "variant", label: <KindLabel text="Productos" off={counts.offVariants} />, icon: UtensilsCrossed },
                { value: "modifier_option", label: <KindLabel text="Extras" off={counts.offOptions} />, icon: SlidersHorizontal },
              ]}
            />
            <SegmentedControl<Status>
              aria-label="Filtrar por estado"
              value={status}
              onValueChange={setStatus}
              className="[&>button]:h-10 [&>button]:px-3 [&>button]:text-body-sm"
              options={[
                { value: "all", label: "Todos" },
                { value: "off", label: `Agotados (${kind === "variant" ? counts.offVariants : counts.offOptions})`, icon: XCircle },
                { value: "on", label: "Disponibles", icon: CheckCircle2 },
              ]}
            />
            <div className="relative w-full lg:ml-auto lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kind === "variant" ? "Buscar producto" : "Buscar extra"}
                aria-label={kind === "variant" ? "Buscar producto" : "Buscar extra"}
                className="h-12 pl-9"
              />
            </div>
          </div>
          {groups.length > 1 && (
            <div
              role="radiogroup"
              aria-label={kind === "variant" ? "Categoría" : "Grupo de extras"}
              className="-mx-3 flex gap-2 overflow-x-auto border-t border-border px-3 pt-3 [scrollbar-width:none]"
            >
              {[{ id: "all", total: ofKind.length, off: kind === "variant" ? counts.offVariants : counts.offOptions }, ...groups].map((g) => {
                const active = group === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setGroup(g.id)}
                    className={cn(
                      posPressable,
                      "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-body-sm font-semibold",
                      active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-border-strong"
                    )}
                  >
                    {g.id === "all" ? (kind === "variant" ? "Todas" : "Todos") : groupLabel(g.id, kind)}
                    {g.off > 0 ? (
                      <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 text-caption tabular-nums", active ? "bg-money-out text-money-out-foreground" : "bg-money-out-soft text-money-out-soft-foreground")}>
                        <X className="size-3" strokeWidth={3} aria-hidden /> {g.off}
                        <span className="sr-only"> agotados</span>
                      </span>
                    ) : (
                      <span className={cn("rounded-full px-1.5 text-caption tabular-nums", active ? "bg-background/20 text-background" : "bg-secondary text-muted-foreground")}>{g.total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {ofKind.length === 0 ? (
          <div className="rounded-card border-2 border-dashed border-border bg-card">
            <EmptyState
              icon={kind === "variant" ? UtensilsCrossed : SlidersHorizontal}
              title={kind === "variant" ? "Aún no hay productos en la carta" : "Aún no hay extras"}
              description={
                canEditMenu
                  ? kind === "variant"
                    ? "Crea productos en la Carta y aparecerán aquí para marcarlos como agotados."
                    : "Crea personalizaciones en la Carta (pestaña Personalizaciones) y aparecerán aquí."
                  : "Pide al encargado que los cree en la Carta."
              }
              action={
                canEditMenu ? (
                  <Link href="/menu" className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button bg-foreground px-5 text-body-sm font-semibold text-background hover:bg-foreground/90")}>
                    <BookOpen className="size-4" aria-hidden /> Ir a la Carta
                  </Link>
                ) : kind === "modifier_option" && counts.variants > 0 ? (
                  <button type="button" onClick={() => setKind("variant")} className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold hover:border-border-strong")}>
                    <UtensilsCrossed className="size-4" aria-hidden /> Ver productos
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-card border border-border bg-card">
            <EmptyState
              icon={status === "off" && !query.trim() ? CheckCircle2 : SearchX}
              title={status === "off" && !query.trim() ? "Nada agotado" : "Sin resultados"}
              description={status === "off" && !query.trim() ? "Todo está disponible." : "Prueba con otra búsqueda o quita los filtros."}
              action={
                filtersActive ? (
                  <button type="button" onClick={resetFilters} className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold hover:border-border-strong")}>
                    <X className="size-4" aria-hidden /> Quitar filtros
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map((s) => {
              const off = s.items.filter((i) => !i.available).length;
              return (
                <section key={s.id} aria-label={groupLabel(s.id, kind)} className="flex flex-col gap-3">
                  <h2 className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-lead font-semibold text-foreground">
                    {groupLabel(s.id, kind)}
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold tabular-nums text-muted-foreground">{s.items.length}</span>
                    {off > 0 && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold tabular-nums", toneSoft["money-out"])}>
                        <X className="size-3.5" strokeWidth={3} aria-hidden /> {off} {off === 1 ? "agotado" : "agotados"}
                      </span>
                    )}
                  </h2>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {s.items.map((item) => (
                      <li key={item.key}>
                        <ItemCard item={item} busy={!!pending[item.key]} onToggle={(v) => toggle(item, v)} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function groupLabel(id: string, kind: Kind) {
  if (id !== NO_GROUP) return id;
  return kind === "variant" ? "Sin categoría" : "Sin grupo";
}

function KindLabel({ text, off }: { text: string; off: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {text}
      {off > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-money-out-soft px-1.5 text-caption font-semibold tabular-nums text-money-out-soft-foreground">
          <X className="size-3" strokeWidth={3} aria-hidden /> {off}
          <span className="sr-only"> agotados</span>
        </span>
      )}
    </span>
  );
}

function ItemCard({
  item,
  busy,
  onToggle,
}: {
  item: AvailabilityItem;
  busy: boolean;
  onToggle: (available: boolean) => void;
}) {
  const on = item.available;
  return (
    <div
      className={cn(
        "flex min-h-20 items-center gap-3 rounded-card border p-3 shadow-sm transition-colors duration-150 motion-reduce:transition-none",
        on ? "border-border bg-card" : "border-money-out-border bg-money-out-soft"
      )}
    >
      {item.itemType === "variant" ? (
        <span className={cn("relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-control border border-border bg-secondary text-muted-foreground", !on && "opacity-60 grayscale")}>
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <UtensilsCrossed className="size-5" strokeWidth={1.75} aria-hidden />
          )}
        </span>
      ) : (
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-control border", on ? toneSoft.info : toneSoft["money-out"])}>
          <SlidersHorizontal className="size-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 wrap-anywhere text-body-sm font-semibold leading-snug text-foreground">{item.title}</p>
        <p className={cn("mt-0.5 flex items-center gap-1 text-caption font-semibold", on ? "text-money-in-soft-foreground" : "text-money-out-soft-foreground")}>
          {on ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          {on ? "Disponible" : "Agotado"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${item.title}: ${on ? "Disponible" : "Agotado"}`}
        aria-busy={busy || undefined}
        onClick={() => onToggle(!on)}
        className={cn(
          posPressable,
          "relative flex h-12 w-[5.5rem] shrink-0 items-center rounded-full border-2 p-1",
          on ? "border-money-in bg-money-in" : "border-money-out-border bg-card"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 items-center justify-center rounded-full shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none",
            on ? "translate-x-10 bg-card text-money-in" : "translate-x-0 bg-money-out text-money-out-foreground"
          )}
        >
          {on ? <Check className="size-5" strokeWidth={3} /> : <X className="size-5" strokeWidth={3} />}
        </span>
      </button>
    </div>
  );
}
