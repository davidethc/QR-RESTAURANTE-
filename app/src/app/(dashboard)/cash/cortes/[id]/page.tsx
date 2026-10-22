import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, AlertTriangle } from "lucide-react";
import { requireRouteAccess } from "@/lib/auth/require-route-access";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getCashSessionSummary, listCashCuts } from "@/lib/actions/cash";
import { PageHeader } from "@/components/shared/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCutDate, formatFolios, signedAmount } from "@/lib/cash-cut";
import { cn, formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { CashTabs } from "../../_components/cash-tabs";
import { CashResultBadge } from "../../_components/cash-result-badge";
import { REASON_LABEL } from "@/lib/cash-labels";

export const instant = false;
export const metadata: Metadata = { title: "Detalle del corte" };

export default async function CutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/cash");
  const tz = session.restaurant.timezone;

  const [summaryResult, cutsResult] = await Promise.all([
    getCashSessionSummary(id),
    listCashCuts(session.restaurant.id, { limit: 200 }),
  ]);
  if (!summaryResult.ok) notFound();
  const s = summaryResult.data;
  // Un turno abierto no tiene corte: el detalle solo existe para cortes guardados.
  if (s.status !== "CLOSED" || !s.can_see_expected) notFound();
  const cut = cutsResult.ok ? cutsResult.data.find((c) => c.id === id) : undefined;
  const byMethod = s.by_method ?? [];
  const diff = s.difference_total ?? 0;
  const folios = s.skipped_order_folios ?? [];

  return (
    <main>
      <PageHeader
        title={`Corte #${s.cut_number ?? "—"}`}
        description={`${s.register_name ?? "Caja"} · ${formatCutDate(s.closed_at, tz)}`}
        action={<CashResultBadge result={s.result} />}
      />
      <CashTabs />
      <div className="flex flex-col gap-6 px-4 pb-12 md:px-8">
        <Link href="/cash/cortes" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-body-sm text-primary">
          <ArrowLeft className="size-4" aria-hidden /> Volver a cortes
        </Link>

        {s.skipped_pending_orders && (
          <div role="note" className="flex gap-3 rounded-control border border-warning-border bg-warning-soft p-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-soft-foreground" aria-hidden />
            <p className="text-body-sm text-foreground">
              Este corte se guardó <strong>omitiendo pedidos sin cobrar</strong>
              {folios.length > 0 && <>: folios {formatFolios(folios)}</>}.
            </p>
          </div>
        )}

        <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Realizado por" value={cut?.closed_by_name ?? "—"} />
          <Stat label="Fondo que queda" value={s.cash_float_left == null ? "—" : formatPrice(s.cash_float_left)} money />
          <Stat label="Efectivo retirado" value={s.cash_to_withdraw == null ? "—" : formatPrice(s.cash_to_withdraw)} money />
          <Stat
            label="Diferencia total"
            value={signedAmount(diff, formatPrice)}
            money
            tone={diff === 0 ? undefined : diff < 0 ? "bad" : "warn"}
          />
        </section>

        <section aria-label="Contado y esperado" className="flex flex-col gap-2">
          <h2 className="text-body font-semibold text-foreground">Esperado frente a contado</h2>
          <div className="overflow-x-auto rounded-card border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byMethod.map((m) => (
                  <TableRow key={m.method} className="h-12">
                    <TableCell className="font-medium">
                      {PAYMENT_METHOD_LABEL[m.method] ?? m.method}
                      {m.tips_total > 0 && (
                        <span className="block text-caption text-muted-foreground">
                          incluye {formatPrice(m.tips_total)} de propina
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(m.expected)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.counted === null ? "No se contó" : formatPrice(m.counted)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        m.difference != null && m.difference < 0 && "text-destructive",
                        m.difference != null && m.difference > 0 && "text-warning-soft-foreground"
                      )}
                    >
                      {m.difference === null ? "—" : signedAmount(m.difference, formatPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {(s.movements?.length ?? 0) > 0 && (
          <section aria-label="Movimientos" className="flex flex-col gap-2">
            <h2 className="text-body font-semibold text-foreground">Entradas y retiros del turno</h2>
            <ul className="flex flex-col gap-1.5">
              {s.movements!.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-control bg-secondary px-3 py-2.5 text-meta">
                  <span className="flex items-center gap-2 text-foreground">
                    {m.type === "IN" ? (
                      <ArrowDownCircle className="size-4 text-success-soft-foreground" aria-hidden />
                    ) : (
                      <ArrowUpCircle className="size-4 text-warning-soft-foreground" aria-hidden />
                    )}
                    {REASON_LABEL[m.reason] ?? m.reason}
                    {m.description && <span className="text-muted-foreground"> · {m.description}</span>}
                  </span>
                  <span className="tabular-nums">
                    {m.type === "IN" ? "+" : "-"}
                    {formatPrice(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.notes && (
          <section aria-label="Nota">
            <h2 className="text-body font-semibold text-foreground">Nota</h2>
            <p className="mt-1 whitespace-pre-wrap text-body-sm text-muted-foreground">{s.notes}</p>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  money,
  tone,
}: {
  label: string;
  value: string;
  money?: boolean;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-title-sm font-semibold",
          money && "font-display tabular-nums text-wine",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-warning-soft-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
