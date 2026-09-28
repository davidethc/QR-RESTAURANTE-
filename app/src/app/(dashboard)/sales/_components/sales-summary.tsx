import Link from "next/link";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { formatPrice } from "@/lib/utils";
import type { SalesReport } from "@/types/staff";
import { DailyBars } from "./daily-bars";
import { StatTile } from "./stat-tile";

export function SalesSummary({ report }: { report: SalesReport }) {
  const { summary } = report;
  const byOrders = report.source === "orders";
  const methodTotal = report.by_method.reduce((sum, m) => sum + Number(m.total), 0);

  return (
    <div className="flex flex-col gap-6">
      {byOrders && (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-meta text-muted-foreground">
          Sin cobro activo, esto suma los pedidos entregados. Para ver métodos de
          pago, propinas y descuentos, activa el cobro en{" "}
          <Link href="/settings" className="font-semibold text-foreground underline">
            Configuración
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendido" value={formatPrice(Number(summary.total_sold))} />
        <StatTile label={byOrders ? "Pedidos" : "Cuentas"} value={String(summary.tickets)} />
        <StatTile label="Ticket promedio" value={formatPrice(Number(summary.avg_ticket))} />
        {byOrders ? null : (
          <StatTile
            label="Propinas"
            value={formatPrice(Number(summary.tips))}
            hint={Number(summary.discounts) > 0 ? `Descuentos: ${formatPrice(Number(summary.discounts))}` : undefined}
          />
        )}
      </div>

      {report.open_bills && report.open_bills.count > 0 && (
        <p className="text-meta text-muted-foreground">
          Ahora mismo hay {report.open_bills.count}{" "}
          {report.open_bills.count === 1 ? "cuenta abierta" : "cuentas abiertas"} por{" "}
          <span className="font-semibold text-foreground">{formatPrice(Number(report.open_bills.total))}</span>{" "}
          sin cobrar (no está sumado arriba).
        </p>
      )}

      {report.days > 1 && <DailyBars from={report.from} to={report.to} rows={report.by_day} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {!byOrders && (
          <section className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              Cómo te pagaron
            </h2>
            {report.by_method.length === 0 ? (
              <p className="text-meta text-muted-foreground">Sin pagos en este periodo.</p>
            ) : (
              <ul className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                {report.by_method.map((m) => {
                  const pct = methodTotal > 0 ? (Number(m.total) / methodTotal) * 100 : 0;
                  return (
                    <li key={m.method} className="flex flex-col gap-1">
                      <div className="flex justify-between text-body-sm">
                        <span className="text-foreground">{PAYMENT_METHOD_LABEL[m.method]}</span>
                        <span className="tabular-nums text-foreground">
                          {formatPrice(Number(m.total))}{" "}
                          <span className="text-muted-foreground">· {Math.round(pct)}%</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary" aria-hidden="true">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Lo más pedido
          </h2>
          {report.top_products.length === 0 ? (
            <EmptyState icon={Receipt} title="Sin ventas en este periodo" />
          ) : (
            <table className="w-full overflow-hidden rounded-2xl border border-border bg-card text-body-sm">
              <thead>
                <tr className="text-left text-caption text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Plato</th>
                  <th className="px-2 py-2 text-right font-medium">Cant.</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.top_products.map((p) => (
                  <tr key={p.name} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{p.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">{p.quantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">
                      {formatPrice(Number(p.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
