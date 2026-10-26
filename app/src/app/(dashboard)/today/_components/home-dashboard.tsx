import Link from "next/link";
import { ChevronRight, CircleHelp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DASHBOARD_SERVICE_LABEL, WEEKDAY_SHORT, groupByServiceOption } from "@/lib/home-dashboard";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { cn, formatPrice } from "@/lib/utils";
import type { AvailabilityItem } from "@/lib/queries/availability";
import type { ChannelSplit, HomeDashboard, HomeDashboardProduct } from "@/types/home-dashboard";

type Format = (n: number) => string;
const money: Format = (n) => formatPrice(Number(n));
const count: Format = (n) => String(Number(n));

/** Card shell: title, optional help tooltip and body. */
function Card({
  title,
  help,
  className,
  children,
}: {
  title: string;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-card border border-border bg-card p-4", className)}>
      <header className="flex items-center gap-1.5">
        <h3 className="text-meta font-semibold text-muted-foreground">{title}</h3>
        {help && (
          <span title={help} aria-label={help} className="text-muted-foreground/70">
            <CircleHelp className="size-3.5" aria-hidden />
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/** Headline figure with its point-of-sale / digital-menu split underneath. */
function StatCard({ title, help, value, format }: { title: string; help?: string; value: ChannelSplit; format: Format }) {
  return (
    <Card title={title} help={help}>
      <p className="text-title font-semibold tabular-nums text-foreground">{format(value.total)}</p>
      <dl className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-caption">
        <div>
          <dt className="text-muted-foreground">Punto de venta</dt>
          <dd className="font-semibold tabular-nums text-foreground">{format(value.pos)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Menú digital</dt>
          <dd className="font-semibold tabular-nums text-foreground">{format(value.digital)}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** Horizontal share bar: rows of label, amount and a bar relative to the largest row. */
function BarList({ rows, format, empty }: { rows: { label: string; value: number; detail?: string }[]; format: Format; empty: string }) {
  const max = Math.max(0, ...rows.map((r) => Number(r.value)));
  if (rows.length === 0 || max === 0) return <p className="text-meta text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="min-w-0 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{format(r.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(Number(r.value) / max) * 100}%` }} />
          </div>
          {r.detail && <span className="text-caption text-muted-foreground">{r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function splitDetail(row: ChannelSplit, format: Format) {
  return `Punto de venta ${format(row.pos)} · Menú digital ${format(row.digital)}`;
}

function ChannelCard({ title, value, format }: { title: string; value: ChannelSplit; format: Format }) {
  return (
    <Card title={title} help="Punto de venta: mostrador, mesas y meseros. Menú digital: QR de mesa y pedidos en línea.">
      <BarList
        rows={[
          { label: "Punto de venta", value: value.pos },
          { label: "Menú digital", value: value.digital },
        ]}
        format={format}
        empty="Sin ventas en este periodo."
      />
    </Card>
  );
}

function WeekdayCard({ data }: { data: HomeDashboard }) {
  if (data.days < 2) {
    return (
      <Card title="Ventas promedio por día de la semana">
        <p className="text-meta text-muted-foreground">Disponible solo para rangos de varios días.</p>
      </Card>
    );
  }
  const byDow = new Map(data.by_weekday.map((w) => [w.dow, Number(w.avg_sales)]));
  const values = WEEKDAY_SHORT.map((_, i) => byDow.get(i + 1) ?? 0);
  const max = Math.max(0, ...values);
  return (
    <Card title="Ventas promedio por día de la semana" help="Lo vendido en promedio cada lunes, martes… del periodo.">
      <ul className="flex h-36 items-end gap-2" aria-label="Ventas promedio por día de la semana">
        {WEEKDAY_SHORT.map((label, i) => (
          <li key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-caption tabular-nums text-muted-foreground">{values[i] > 0 ? money(values[i]) : ""}</span>
            <div
              className="w-full rounded-t-sm bg-primary/80"
              style={{ height: max > 0 ? `${Math.max(2, (values[i] / max) * 100)}%` : "2%" }}
              aria-label={`${label}: ${money(values[i])}`}
            />
            <span className="text-caption font-semibold text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProductsCard({ title, rows, empty }: { title: string; rows: HomeDashboardProduct[]; empty: string }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-meta text-muted-foreground">{empty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-control border border-border">
          {rows.map((p, i) => (
            <li key={`${p.name}-${i}`} className="flex items-center gap-3 px-3 py-2.5 text-body-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-caption font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">×{p.quantity}</span>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-foreground">{money(p.amount)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Sold-out variants or options. Visible to every role: it is operational, not money. */
export function SoldOutCard({
  title,
  items,
  icon: Icon,
  moreHref,
}: {
  title: string;
  items: AvailabilityItem[];
  icon: LucideIcon;
  moreHref: string | null;
}) {
  const shown = items.slice(0, 5);
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-meta text-muted-foreground">Nada agotado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => (
            <li key={item.key} className="flex items-center gap-2.5 text-body-sm">
              <Icon className="size-4 shrink-0 text-money-out" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {item.subtitle ? `${item.title} · ${item.subtitle}` : item.title}
              </span>
              <span className="shrink-0 rounded-full bg-money-out-soft px-2 py-0.5 text-caption font-semibold text-money-out-soft-foreground">
                Agotado
              </span>
            </li>
          ))}
        </ul>
      )}
      {moreHref && items.length > 0 && (
        <Link href={moreHref} className="flex items-center gap-0.5 self-start text-body-sm font-semibold text-primary hover:underline">
          {items.length > shown.length ? `Ver ${items.length - shown.length} más` : "Ver disponibilidad"}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </Card>
  );
}

/** The money cards of "Hoy" for the chosen range. Owner and Admin only. */
export function HomeDashboardCards({ data }: { data: HomeDashboard }) {
  const services = groupByServiceOption(data.by_service);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total de ventas" help="Solo lo cobrado. Un pedido cancelado sin pago no cuenta." value={data.sales} format={money} />
      <StatCard title="Pedidos" help="Pedidos de cuentas ya cobradas." value={data.orders} format={count} />
      <StatCard title="Ticket promedio" help="Ventas ÷ pedidos." value={data.avg_ticket} format={money} />
      <StatCard title="Propinas" value={data.tips} format={money} />
      <StatCard title="Envíos" help="Costos de envío cobrados en pedidos a domicilio." value={data.shipping} format={money} />
      <ChannelCard title="Ventas por canal de venta" value={data.sales} format={money} />
      <ChannelCard title="Pedidos por canal de venta" value={data.orders} format={count} />
      <Card title="Métodos de pago más usados">
        <BarList
          rows={data.by_method.map((m) => ({
            label: PAYMENT_METHOD_LABEL[m.method as keyof typeof PAYMENT_METHOD_LABEL] ?? m.method,
            value: m.total,
            detail: splitDetail(m, money),
          }))}
          format={money}
          empty="Sin cobros en este periodo."
        />
      </Card>
      <WeekdayCard data={data} />
      <Card title="Total de ventas por opción de servicio" className="sm:col-span-2 xl:col-span-1" help={Object.values(DASHBOARD_SERVICE_LABEL).filter((v, i, a) => a.indexOf(v) === i).join(", ")}>
        <BarList
          rows={services.map((s) => ({ label: s.label, value: s.total, detail: splitDetail(s, money) }))}
          format={money}
          empty="Sin ventas en este periodo."
        />
      </Card>
      <ProductsCard title="Productos con más ventas" rows={data.top_products} empty="Sin ventas en este periodo." />
      <ProductsCard title="Productos menos vendidos" rows={data.bottom_products} empty="Sin ventas en este periodo." />
    </div>
  );
}
