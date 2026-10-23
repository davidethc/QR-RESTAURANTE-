"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Armchair, BellRing, Clock, History, LayoutGrid, Map as MapIcon, MousePointerClick, Settings, Users, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { StatusMetric } from "@/components/shared/status-strip";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { useLiveOrders } from "@/app/(dashboard)/_components/staff-live-provider";
import { useNow } from "@/components/shared/clock";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn, formatPrice } from "@/lib/utils";
import type { PanelTable, PanelZone } from "@/lib/queries/tables-panel";
import type { UserRole } from "@/config/constants";
import { TablePanel } from "./table-panel";
import { TableTile } from "./table-tile";
import { LEGEND, TABLE_STATES, isOccupied, openBalance, tableStates } from "./table-state";

type Layout = "grid" | "plan";

/**
 * Mesas as a POS floor, with Caja's identity: header with metric tiles,
 * zones as a segmented control, a legend, the tables as state-colored cards
 * and the selected table's actions in a side panel (full sheet on phone).
 */
export function TablesWorkspace({
  zones,
  role,
  canServeTable,
  billingEnabled,
  maxWaiterDiscountPct,
  manage,
}: {
  zones: PanelZone[];
  role: UserRole;
  canServeTable: boolean;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
  /** Owner/admin tools (menu link, QR PDF, create tables). */
  manage: React.ReactNode;
}) {
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [layout, setLayout] = useState<Layout>("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // A table opened without tickets stays AVAILABLE in the DB until its first
  // order, so the session returned by openTable is remembered here.
  const [justOpened, setJustOpened] = useState<Record<string, string>>({});
  const since = useOldestActiveOrder();
  const now = useNow("minute");

  const all = useMemo(() => zones.flatMap((z) => z.tables), [zones]);

  if (zones.length === 0) {
    return (
      <>
        <Header metrics={null} manage={manage} />
        <div className="px-4 py-10 md:px-6">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-card border-2 border-dashed border-border bg-card px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Users className="size-6" aria-hidden />
            </span>
            <p className="text-body font-semibold text-foreground">Aún no hay zonas ni mesas</p>
            <p className="text-body-sm text-muted-foreground">Configura las zonas y mesas del local para empezar a atender.</p>
            <Link href="/settings" className={cn(posPressable, "mt-2 flex min-h-12 items-center gap-2 rounded-button bg-foreground px-5 text-body font-semibold text-background")}>
              <Settings className="size-4" aria-hidden /> Configurar zonas y mesas
            </Link>
          </div>
        </div>
      </>
    );
  }

  const zone = zones.find((z) => z.id === zoneId) ?? zones[0];
  const selected = all.find((t) => t.id === selectedId) ?? null;
  const selectedZone = selected ? zones.find((z) => z.id === selected.zoneId) ?? null : null;
  const occupiedOf = (t: PanelTable) => isOccupied(t, justOpened);
  const minutesOf = (t: PanelTable) => {
    const iso = since.get(t.number);
    if (!iso || now === null || !occupiedOf(t)) return null;
    return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  };

  const busy = all.filter(occupiedOf);
  const toCharge = busy.reduce((sum, t) => sum + (openBalance(t) ?? t.total), 0);
  const attention = all.filter((t) => t.waiterRequested || t.billRequested || t.pendingApproval > 0).length;

  function select(id: string) {
    setSelectedId(id);
    if (!isWide) setSheetOpen(true);
  }

  function close() {
    setSheetOpen(false);
    setSelectedId(null);
  }

  const panel =
    selected && selectedZone ? (
      <TablePanel
        key={selected.id}
        table={selected}
        zoneName={selectedZone.name}
        zoneTables={selectedZone.tables}
        justOpenedSessionId={justOpened[selected.id] ?? null}
        onOpened={(sessionId) => setJustOpened((m) => ({ ...m, [selected.id]: sessionId }))}
        onClose={close}
        onBeforeCharge={() => setSheetOpen(false)}
        role={role}
        canServeTable={canServeTable}
        billingEnabled={billingEnabled}
        maxWaiterDiscountPct={maxWaiterDiscountPct}
        minutes={minutesOf(selected)}
      />
    ) : null;

  const hasPlan = zone.tables.length > 0;
  const tiles = (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
      {zone.tables.map((t) => (
        <li key={t.id}>
          <TableTile
            table={t}
            states={tableStates(t, occupiedOf(t))}
            occupied={occupiedOf(t)}
            minutes={minutesOf(t)}
            selected={t.id === selectedId}
            onSelect={() => select(t.id)}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:flex-col">
      <Header
        manage={manage}
        metrics={
          <>
            <StatusMetric label="Libres" value={`${all.length - busy.length} de ${all.length}`} icon={Armchair} />
            <StatusMetric label="Ocupadas" value={String(busy.length)} tone="info" icon={Users} />
            <StatusMetric label="Por cobrar" value={formatPrice(toCharge)} tone={toCharge > 0 ? "attention" : "neutral"} icon={Wallet} />
            <StatusMetric label="Piden atención" value={String(attention)} tone={attention > 0 ? "money-out" : "neutral"} icon={BellRing} />
          </>
        }
      />

      <div className="grid gap-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label="Sala" className="flex min-h-0 flex-col gap-4 px-4 py-4 md:px-5 lg:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            {zones.length > 1 ? (
              <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                <SegmentedControl
                  aria-label="Zona"
                  value={zone.id}
                  onValueChange={setZoneId}
                  options={zones.map((z) => {
                    const used = z.tables.filter(occupiedOf).length;
                    return { value: z.id, label: <span className="whitespace-nowrap">{z.name} <span className="tabular-nums opacity-70">{used}/{z.tables.length}</span></span> };
                  })}
                />
              </div>
            ) : (
              <h2 className="text-lead font-semibold text-foreground">
                {zone.name} <span className="text-body-sm font-medium tabular-nums text-muted-foreground">· {zone.tables.length} mesas</span>
              </h2>
            )}
            {hasPlan && (
              <SegmentedControl
                aria-label="Vista"
                size="sm"
                value={layout}
                onValueChange={setLayout}
                className="ml-auto max-md:hidden"
                options={[
                  { value: "grid", label: "Tarjetas", icon: LayoutGrid },
                  { value: "plan", label: "Plano", icon: MapIcon },
                ]}
              />
            )}
          </div>

          <Legend />

          {zone.tables.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="text-body font-semibold text-foreground">Esta zona no tiene mesas</p>
              <p className="text-body-sm text-muted-foreground">Agrégalas desde Configuración para empezar a atenderlas.</p>
              <Link href="/settings" className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold hover:bg-muted")}>
                <Settings className="size-4" aria-hidden /> Ir a Configuración
              </Link>
            </div>
          ) : layout === "plan" ? (
            <>
              <div className="md:hidden">{tiles}</div>
              <div
                className="hidden gap-3 overflow-x-auto rounded-card border border-border bg-card p-3 md:grid"
                style={{
                  gridTemplateColumns: `repeat(${zone.gridCols}, minmax(9.5rem, 1fr))`,
                  gridAutoRows: "minmax(8rem, auto)",
                }}
              >
                {placeTables(zone.tables, zone.gridCols).map(({ table: t, col, row }) => (
                  <TableTile
                    key={t.id}
                    table={t}
                    states={tableStates(t, occupiedOf(t))}
                    occupied={occupiedOf(t)}
                    minutes={minutesOf(t)}
                    selected={t.id === selectedId}
                    onSelect={() => select(t.id)}
                    className={t.shape === "round" ? "rounded-[2rem]" : undefined}
                    style={{ gridColumn: `${col + 1} / span ${t.widthCells}`, gridRow: `${row + 1} / span ${t.heightCells}` }}
                  />
                ))}
              </div>
            </>
          ) : (
            tiles
          )}
        </section>

        <aside aria-label="Detalle de la mesa" className="hidden min-h-0 border-l border-border bg-background lg:flex lg:flex-col">
          {panel ?? <PanelGuide />}
        </aside>
      </div>

      {!isWide && (
        <Sheet
          open={sheetOpen && !!panel}
          onOpenChange={(o) => {
            setSheetOpen(o);
            if (!o) setSelectedId(null);
          }}
        >
          <SheetContent side="bottom" showCloseButton={false} className="flex h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-3xl p-0">
            <SheetTitle className="sr-only">{selected ? `Mesa ${selected.number}` : "Mesa"}</SheetTitle>
            <SheetDescription className="sr-only">Estado, pedidos y acciones de la mesa.</SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/** Oldest active order per table number, from the shared live store (no new channel). */
function useOldestActiveOrder(): Map<number, string> {
  const orders = useLiveOrders();
  return useMemo(() => {
    const m = new Map<number, string>();
    for (const o of orders ?? []) {
      if (o.table_kind !== "TABLE") continue;
      const cur = m.get(o.table_number);
      if (!cur || o.created_at < cur) m.set(o.table_number, o.created_at);
    }
    return m;
  }, [orders]);
}

function Header({ metrics, manage }: { metrics: React.ReactNode; manage: React.ReactNode }) {
  return (
    <section aria-label="Estado de la sala" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5">
      <div className="flex min-w-0 items-center gap-3 max-md:w-full">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <LayoutGrid className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-body font-semibold leading-tight text-foreground">Mesas</h1>
          <p className="text-meta leading-tight text-muted-foreground">Toca una mesa para atenderla</p>
        </div>
        <HistoryLink className={cn("ml-auto", manage && "md:hidden")} />
      </div>
      {metrics && (
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-stretch gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:border-l md:border-border md:px-0 md:pl-4">
          {metrics}
        </div>
      )}
      {manage && (
        <div className={cn("-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:ml-auto md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:px-0 [&>*]:shrink-0")}>
          {manage}
          <HistoryLink className="max-md:hidden" />
        </div>
      )}
    </section>
  );
}

function HistoryLink({ className }: { className?: string }) {
  return (
    <Link
      href="/tables/history"
      className={cn(
        "flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-button px-3 text-body-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        className
      )}
    >
      <History className="size-5" aria-hidden /> <span className="max-2xl:sr-only">Historial</span>
    </Link>
  );
}

function Legend() {
  return (
    <ul aria-label="Leyenda de estados" className="flex flex-wrap gap-x-2 gap-y-1.5 rounded-card border border-border bg-card px-3 py-2">
      {LEGEND.map((key) => {
        const s = TABLE_STATES[key];
        const Icon = s.icon;
        return (
          <li
            key={key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold leading-tight",
              toneSoft[s.tone],
              s.tone === "neutral" && "bg-secondary text-muted-foreground"
            )}
          >
            <Icon className="size-3.5" aria-hidden /> {s.label}
          </li>
        );
      })}
      <li className="inline-flex items-center gap-1 px-1 text-caption text-muted-foreground">
        <Clock className="size-3.5" aria-hidden /> desde el pedido más antiguo en curso
      </li>
    </ul>
  );
}

/** Right panel with no table selected: what to do, in three steps. */
function PanelGuide() {
  const steps = [
    { n: 1, title: "Elige la mesa", text: "Toca una mesa de la sala." },
    { n: 2, title: "Atiéndela", text: "Ábrela o toma su pedido." },
    { n: 3, title: "Cierra", text: "Cobra y libera la mesa." },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-20 items-center justify-center rounded-3xl border border-border bg-card text-muted-foreground shadow-sm">
          <MousePointerClick className="size-9" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-title-sm font-semibold text-foreground">Selecciona una mesa</h2>
          <p className="max-w-xs text-body-sm text-muted-foreground">Aquí verás su consumo, sus pedidos y lo que puedes hacer con ella.</p>
        </div>
      </div>
      <ol className="grid w-full max-w-sm gap-2">
        {steps.map((s) => (
          <li key={s.n} className="flex items-center gap-3 rounded-card border border-border bg-card p-3 text-left">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-caption font-bold tabular-nums text-background">{s.n}</span>
            <span className="min-w-0">
              <span className="block text-body-sm font-semibold text-foreground">{s.title}</span>
              <span className="block text-meta leading-snug text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Tables without a floor position (created before zones) go to free cells instead of piling on (0,0). */
function placeTables<T extends { col: number | null; row: number | null; widthCells: number; heightCells: number }>(
  tables: T[],
  gridCols: number,
): { table: T; col: number; row: number }[] {
  const used = new Set<string>();
  const mark = (c: number, r: number, w: number, h: number) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) used.add(`${c + i},${r + j}`);
  };
  for (const t of tables) if (t.col != null && t.row != null) mark(t.col, t.row, t.widthCells, t.heightCells);
  return tables.map((t) => {
    if (t.col != null && t.row != null) return { table: t, col: t.col, row: t.row };
    for (let r = 0; ; r++) {
      for (let c = 0; c + t.widthCells <= gridCols; c++) {
        let free = true;
        for (let i = 0; i < t.widthCells && free; i++)
          for (let j = 0; j < t.heightCells; j++) if (used.has(`${c + i},${r + j}`)) free = false;
        if (free) {
          mark(c, r, t.widthCells, t.heightCells);
          return { table: t, col: c, row: r };
        }
      }
    }
  });
}
