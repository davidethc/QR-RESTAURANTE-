import Link from "next/link";
import { CalendarDays, CreditCard, Info, Receipt, Settings, Trophy } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { posPressable } from "@/components/shared/pos-tone";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { cn, formatPrice } from "@/lib/utils";
import type { SalesReport } from "@/types/staff";
import { TodaySection } from "../../today/_components/today-blocks";
import { DailyBars } from "./daily-bars";

/**
 * Cuerpo de Ventas: cada bloque en su tarjeta con cabecera (como Hoy y
 * Caja). Las cifras del periodo viven en la franja de la página.
 */
export function SalesSummary({ report, canOpenSettings }: { report: SalesReport; canOpenSettings: boolean }) {
  const { summary } = report;
  const byOrders = report.source === "orders";
  const methodTotal = report.by_method.reduce((sum, m) => sum + Number(m.total), 0);
  const discounts = Number(summary.discounts);

  return (
    <div className="flex flex-col gap-4">
      {byOrders && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-info-border bg-info-soft px-4 py-3 text-info-soft-foreground">
          <Info className="size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-body-sm">
            Sin cobro activo, esto suma los pedidos entregados. Para ver métodos de pago, propinas y descuentos, activa el cobro.
          </p>
          {canOpenSettings && (
          <Link
            href="/settings"
            className={cn(posPressable, "inline-flex h-10 items-center gap-2 rounded-button bg-card px-3 text-body-sm font-semibold text-foreground")}
          >
            <Settings className="size-4" aria-hidden />
            Ir a Configuración
          </Link>
          )}
        </div>
      )}

      {report.open_bills && report.open_bills.count > 0 && (
        <p className="flex items-center gap-2 text-meta text-muted-foreground">
          <Receipt className="size-4 text-attention-soft-foreground" aria-hidden />
          {report.open_bills.count === 1
            ? "La cuenta abierta no está sumada en lo vendido hasta cobrarse."
            : `Las ${report.open_bills.count} cuentas abiertas no están sumadas en lo vendido hasta cobrarse.`}
        </p>
      )}

      {report.days > 1 && (
        <TodaySection id="sales-daily" title="Venta por día" icon={CalendarDays}>
          <DailyBars from={report.from} to={report.to} rows={report.by_day} />
        </TodaySection>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {!byOrders && (
          <TodaySection
            id="sales-methods"
            title="Cómo te pagaron"
            icon={CreditCard}
            aside={
              discounts > 0 ? (
                <span className="rounded-full border border-money-out-border bg-money-out-soft px-2 py-0.5 text-caption font-semibold text-money-out-soft-foreground">
                  Descuentos {formatPrice(discounts)}
                </span>
              ) : null
            }
          >
            {report.by_method.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Sin pagos en este periodo"
                description="Los cobros de Caja aparecen aquí por método."
                action={<CashLink />}
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {report.by_method.map((m) => {
                  const pct = methodTotal > 0 ? (Number(m.total) / methodTotal) * 100 : 0;
                  return (
                    <li key={m.method} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="font-medium text-foreground">{PAYMENT_METHOD_LABEL[m.method]}</span>
                        <span className="tabular-nums text-foreground">
                          <span className="font-semibold">{formatPrice(Number(m.total))}</span>{" "}
                          <span className="text-muted-foreground">· {Math.round(pct)}%</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary" aria-hidden="true">
                        <div className="h-2 rounded-full bg-money-in" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TodaySection>
        )}

        <TodaySection
          id="sales-top"
          title="Lo más pedido"
          icon={Trophy}
          aside={
            report.top_products.length > 0 ? (
              <span className="text-caption text-muted-foreground">{report.top_products.length} productos</span>
            ) : null
          }
        >
          {report.top_products.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin ventas en este periodo"
              description="Prueba con un rango más largo o toma un pedido."
              action={<CashLink />}
            />
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-caption text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Plato</th>
                  <th className="px-2 py-2.5 text-right font-medium">Cant.</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.top_products.map((p, i) => (
                  <tr key={p.name}>
                    <td className="px-4 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-caption font-semibold tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="min-w-0 truncate text-foreground">{p.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-foreground">×{p.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                      {formatPrice(Number(p.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TodaySection>
      </div>
    </div>
  );
}

function CashLink() {
  return (
    <Link
      href="/today"
      className={cn(posPressable, "inline-flex h-10 items-center rounded-button border border-border bg-card px-4 text-body-sm font-semibold text-foreground hover:border-border-strong")}
    >
      Ir a Hoy
    </Link>
  );
}
