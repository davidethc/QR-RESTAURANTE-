import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Scissors } from "lucide-react";
import { requireRouteAccess } from "@/lib/auth/require-route-access";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getLastCashFloat, listCashCuts } from "@/lib/actions/cash";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { segmentedItemClass, segmentedListClass } from "@/components/shared/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCutDate } from "@/lib/cash-cut";
import { cn, formatPrice } from "@/lib/utils";
import { CashTabs } from "../_components/cash-tabs";
import { CashResultBadge } from "../_components/cash-result-badge";

export const instant = false;
export const metadata: Metadata = { title: "Cortes de caja" };

export default async function CutsPage({ searchParams }: { searchParams: Promise<{ caja?: string }> }) {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/cash");
  const tz = session.restaurant.timezone;
  const { caja } = await searchParams;

  const [floats, cuts] = await Promise.all([
    getLastCashFloat(session.restaurant.id),
    listCashCuts(session.restaurant.id, { registerId: caja && /^[0-9a-f-]{36}$/i.test(caja) ? caja : undefined }),
  ]);
  const registers = floats.ok ? floats.data : [];
  const rows = cuts.ok ? cuts.data : [];

  return (
    <main>
      <PageHeader title="Caja" description="Cortes de caja a ciegas" />
      <CashTabs />
      <div className="flex flex-col gap-8 px-4 pb-12 md:px-8">
        {registers.length > 0 && (
          <section aria-label="Último fondo de caja" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {registers.map((r) => (
              <div key={r.register_id} className="rounded-card border border-border bg-card p-4">
                <p className="text-meta text-muted-foreground">Último fondo · {r.register_name}</p>
                {r.cash_float_left === null ? (
                  <p className="mt-1 text-body-sm text-muted-foreground">Aún no hay un corte con fondo registrado.</p>
                ) : (
                  <>
                    <p className="mt-1 font-display text-title-lg font-semibold tabular-nums text-wine">
                      {formatPrice(r.cash_float_left)}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      Lo dejó {r.set_by_name ?? "alguien del equipo"} · {formatCutDate(r.set_at, tz)}
                    </p>
                  </>
                )}
              </div>
            ))}
          </section>
        )}

        {registers.length > 1 && (
          <nav aria-label="Filtrar por caja" className="overflow-x-auto">
            <div className={segmentedListClass("min-w-max")}>
              <Link href="/cash/cortes" className={cn(segmentedItemClass(!caja), "min-h-11 px-4")}>
                Todas
              </Link>
              {registers.map((r) => (
                <Link
                  key={r.register_id}
                  href={`/cash/cortes?caja=${r.register_id}`}
                  className={cn(segmentedItemClass(caja === r.register_id), "min-h-11 px-4")}
                >
                  {r.register_name}
                </Link>
              ))}
            </div>
          </nav>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Scissors}
            title="Aún no hay cortes"
            description="Haz el primer corte a ciegas desde Turno: cuentas el efectivo sin ver el sistema y así se detectan faltantes a tiempo."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corte</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead className="text-right">Total esperado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="h-12">
                    <TableCell className="font-semibold tabular-nums">
                      <Link
                        href={`/cash/cortes/${c.id}`}
                        className="-m-2 inline-flex min-h-11 items-center p-2 text-primary underline-offset-4 hover:underline"
                      >
                        #{c.cut_number}
                      </Link>
                    </TableCell>
                    <TableCell>{formatCutDate(c.closed_at, tz)}</TableCell>
                    <TableCell>{c.register_name}</TableCell>
                    <TableCell>{c.closed_by_name ?? "—"}</TableCell>
                    <TableCell>
                      <CashResultBadge result={c.result} />
                      {c.skipped_pending_orders && (
                        <span className="ml-2 text-caption text-warning-soft-foreground">con pendientes</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.expected_total === null ? "—" : formatPrice(c.expected_total)}
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
