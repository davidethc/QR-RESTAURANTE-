"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, ClipboardList, History, Receipt, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils";
import { TableDetailDialog } from "./table-detail-dialog";
import type { PanelTable, PanelZone } from "@/lib/queries/tables-panel";
import type { UserRole } from "@/config/constants";

interface TablesPanelProps {
  zones: PanelZone[];
  role: UserRole;
  canServeTable: boolean;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
}

export function tableLabel(t: Pick<PanelTable, "name" | "number">) {
  return t.name ?? `Mesa ${t.number}`;
}

/** Una mesa está ocupada con sesión abierta, aunque aún no tenga comandas. */
export function isOccupied(t: PanelTable, justOpened: Record<string, string>) {
  return t.status !== "AVAILABLE" || !!t.sessionId || t.id in justOpened;
}

function Counter({ label, value, icon: Icon, accent }: {
  label: string;
  value: number;
  icon: typeof Receipt;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
      <Icon
        className={cn("size-5 shrink-0", accent && value > 0 ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate text-meta text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

function TableTile({
  table,
  occupied,
  onSelect,
  className,
  style,
}: {
  table: PanelTable;
  occupied: boolean;
  onSelect: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hasNew = table.orders.some((o) => o.isNew);
  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      aria-label={`${tableLabel(table)}, ${occupied ? "ocupada" : "disponible"}`}
      className={cn(
        "relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 border p-1 text-center transition-colors",
        table.shape === "round" ? "rounded-full" : "rounded-card",
        occupied
          ? "border-primary/40 bg-honey-soft text-honey-soft-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
        table.billRequested && "border-warning-border ring-2 ring-warning-indicator/50",
        className
      )}
    >
      {table.pendingApproval > 0 && (
        <span
          className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-wine px-1 text-tiny font-bold leading-5 text-wine-foreground"
          aria-label={`${table.pendingApproval} pedido(s) por aprobar`}
        >
          {table.pendingApproval}
        </span>
      )}
      {hasNew && table.pendingApproval === 0 && (
        <span
          className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-success-indicator"
          aria-label="Comanda nueva"
        />
      )}
      <span className="max-w-full truncate text-body-sm font-semibold leading-tight">
        {tableLabel(table)}
      </span>
      {occupied && table.total > 0 && (
        <span className="text-tiny font-medium tabular-nums">{formatPrice(table.total)}</span>
      )}
      {table.billRequested ? (
        <span className="text-tiny font-semibold">Cuenta</span>
      ) : table.waiterRequested ? (
        <span className="text-tiny font-semibold">Mesero</span>
      ) : null}
    </button>
  );
}

export function TablesPanel({
  zones,
  role,
  canServeTable,
  billingEnabled,
  maxWaiterDiscountPct,
}: TablesPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mesa recién abierta sin comanda: sigue AVAILABLE en la base hasta el
  // primer pedido, así que se recuerda la sesión que devolvió openTable.
  const [justOpened, setJustOpened] = useState<Record<string, string>>({});

  if (zones.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Aún no hay zonas ni mesas"
        description="Configura primero las zonas y mesas del local para empezar a atender."
        action={
          <Button asChild className="h-11 rounded-control">
            <Link href="/settings">Configurar zonas y mesas</Link>
          </Button>
        }
      />
    );
  }

  const all = zones.flatMap((z) => z.tables);
  const selected = all.find((t) => t.id === selectedId) ?? null;
  const selectedZone = selected ? zones.find((z) => z.id === selected.zoneId)! : null;
  const counters = {
    bill: all.filter((t) => t.billRequested).length,
    waiter: all.filter((t) => t.waiterRequested).length,
    unreviewed: all.reduce((n, t) => n + t.orders.filter((o) => o.isNew).length, 0),
    active: all.filter((t) => isOccupied(t, justOpened)).length,
  };

  return (
    <div className="flex min-h-full flex-col gap-4 px-4 pb-6 lg:px-6">
      <div className="grid grid-cols-2 divide-border rounded-card border border-border bg-card sm:grid-cols-4 sm:divide-x">
        <Counter label="Solicitando cuenta" value={counters.bill} icon={Receipt} accent />
        <Counter label="Solicitando mesero" value={counters.waiter} icon={BellRing} accent />
        <Counter label="Comandas sin revisar" value={counters.unreviewed} icon={ClipboardList} accent />
        <Counter label="Mesas activas" value={counters.active} icon={Users} />
      </div>

      <Tabs defaultValue={zones[0].id} className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="max-w-full overflow-x-auto">
            <TabsList className="h-auto min-h-11 flex-wrap">
              {zones.map((z) => {
                const bill = z.tables.some((t) => t.billRequested);
                const fresh = z.tables.some((t) => t.orders.some((o) => o.isNew));
                return (
                  <TabsTrigger key={z.id} value={z.id} className="min-h-11 gap-2 px-3">
                    {z.name}
                    <span className="text-tiny tabular-nums text-muted-foreground">
                      {z.tables.filter((t) => isOccupied(t, justOpened)).length}/{z.tables.length}
                    </span>
                    {bill && <span className="size-2 rounded-full bg-warning-indicator" aria-label="Esperando cuenta" />}
                    {fresh && <span className="size-2 rounded-full bg-success-indicator" aria-label="Comandas nuevas" />}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          <Button asChild variant="outline" className="h-11 rounded-control">
            <Link href="/tables/history">
              <History className="size-4" /> Historial
            </Link>
          </Button>
        </div>

        {zones.map((z) => (
          <TabsContent key={z.id} value={z.id}>
            {z.tables.length === 0 ? (
              <EmptyState icon={Users} title="Esta zona no tiene mesas" description="Agrégalas desde Configuración." />
            ) : (
              <>
                {/* Teléfono: lista táctil. El plano proporcional no cabe a 390 px. */}
                <div className="grid grid-cols-2 gap-3 md:hidden">
                  {z.tables.map((t) => (
                    <TableTile
                      key={t.id}
                      table={t}
                      occupied={isOccupied(t, justOpened)}
                      onSelect={() => setSelectedId(t.id)}
                      className="min-h-20"
                    />
                  ))}
                </div>
                <div
                  className="hidden gap-2 rounded-card border border-border bg-muted/30 p-3 md:grid"
                  style={{
                    gridTemplateColumns: `repeat(${z.gridCols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${z.gridRows}, minmax(3rem, 1fr))`,
                  }}
                >
                  {placeTables(z.tables, z.gridCols).map(({ table: t, col, row }) => (
                    <TableTile
                      key={t.id}
                      table={t}
                      occupied={isOccupied(t, justOpened)}
                      onSelect={() => setSelectedId(t.id)}
                      style={{
                        gridColumn: `${col + 1} / span ${t.widthCells}`,
                        gridRow: `${row + 1} / span ${t.heightCells}`,
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selected && selectedZone && (
        <TableDetailDialog
          key={selected.id}
          table={selected}
          zoneTables={selectedZone.tables}
          justOpenedSessionId={justOpened[selected.id] ?? null}
          onOpened={(sessionId) => setJustOpened((m) => ({ ...m, [selected.id]: sessionId }))}
          onClose={() => setSelectedId(null)}
          role={role}
          canServeTable={canServeTable}
          billingEnabled={billingEnabled}
          maxWaiterDiscountPct={maxWaiterDiscountPct}
        />
      )}
    </div>
  );
}

/** Mesas sin posición en el plano (creadas antes de las zonas) se acomodan en celdas libres en vez de apilarse en (0,0). */
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
