import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { requireRouteAccess } from "@/lib/auth/require-route-access";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getLastCashFloat, listCashMovements } from "@/lib/actions/cash";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { segmentedItemClass, segmentedListClass } from "@/components/shared/segmented-classes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCutDate } from "@/lib/cash-cut";
import { cn, formatPrice } from "@/lib/utils";
import { CashTabs } from "../_components/cash-tabs";
import { CashFlowActions } from "../_components/cash-flow-actions";
import { REASON_LABEL } from "@/lib/cash-labels";

export const instant = false;
export const metadata: Metadata = { title: "Entradas y retiros" };

const FILTERS = [
  { value: "all", label: "Todos" },
  { value: "IN", label: "Entradas" },
  { value: "OUT", label: "Salidas" },
] as const;

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/cash");
  const tz = session.restaurant.timezone;
  const { tipo } = await searchParams;
  const filter = tipo === "IN" || tipo === "OUT" ? tipo : "all";

  const [movs, floats] = await Promise.all([
    listCashMovements(session.restaurant.id),
    getLastCashFloat(session.restaurant.id),
  ]);
  const all = movs.ok ? movs.data : [];
  const rows = filter === "all" ? all : all.filter((m) => m.type === filter);
  const openSessions = (floats.ok ? floats.data : [])
    .filter((r) => r.open_session_id)
    .map((r) => ({ id: r.open_session_id as string, name: r.register_name }));
  const totalIn = all.filter((m) => m.type === "IN").reduce((a, m) => a + m.amount, 0);
  const totalOut = all.filter((m) => m.type === "OUT").reduce((a, m) => a + m.amount, 0);

  return (
    <main>
      <PageHeader
        title="Caja"
        description="Dinero que entró y salió de la caja"
        action={
          openSessions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <CashFlowActions session={openSessions[0]} />
            </div>
          ) : undefined
        }
      />
      <CashTabs />
      <div className="flex flex-col gap-6 px-4 pb-12 md:px-8">
        {openSessions.length === 0 && (
          <p className="text-meta text-muted-foreground">
            Abre una caja en Turno para poder registrar movimientos.
          </p>
        )}

        <section aria-label="Totales" className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-card p-4">
            <p className="text-meta text-muted-foreground">Total de entradas</p>
            <p className="font-display text-title-lg font-semibold tabular-nums text-wine">{formatPrice(totalIn)}</p>
          </div>
          <div className="rounded-card border border-border bg-card p-4">
            <p className="text-meta text-muted-foreground">Total de retiros</p>
            <p className="font-display text-title-lg font-semibold tabular-nums text-wine">{formatPrice(totalOut)}</p>
          </div>
        </section>

        <nav aria-label="Tipo de movimiento" className="overflow-x-auto">
          <div className={segmentedListClass("min-w-max")}>
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value === "all" ? "/cash/movimientos" : `/cash/movimientos?tipo=${f.value}`}
                aria-current={filter === f.value ? "page" : undefined}
                className={cn(segmentedItemClass(filter === f.value), "min-h-11 px-4")}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </nav>

        {rows.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Sin movimientos"
            description="Registra cada entrada o retiro de efectivo con su motivo para que el siguiente corte cuadre con exactitud."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Movimiento</TableHead>
                  <TableHead>Tipo y motivo</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Corte</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id} className="h-12">
                    <TableCell className="tabular-nums">{m.number ? `#${m.number}` : "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {m.type === "IN" ? (
                          <ArrowDownCircle className="size-4 text-success-soft-foreground" aria-label="Entrada" />
                        ) : (
                          <ArrowUpCircle className="size-4 text-warning-soft-foreground" aria-label="Retiro" />
                        )}
                        {REASON_LABEL[m.reason] ?? m.reason}
                      </span>
                      {m.description && <span className="block text-caption text-muted-foreground">{m.description}</span>}
                    </TableCell>
                    <TableCell>{m.register_name}</TableCell>
                    <TableCell className="tabular-nums">{m.cut_number ? `#${m.cut_number}` : "Turno actual"}</TableCell>
                    <TableCell>{formatCutDate(m.created_at, tz)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {m.type === "IN" ? "+" : "-"}
                      {formatPrice(m.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
}
