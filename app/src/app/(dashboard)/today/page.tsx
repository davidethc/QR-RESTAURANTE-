import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChefHat, ClipboardList, LayoutGrid, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import {
  getDashboardSummary,
  getMyRestaurant,
  getRestaurantSettings,
  getSalesReport,
} from "@/lib/queries/staff";
import { getOpenCashSessionId } from "@/lib/queries/cash";
import { isManager } from "@/lib/permissions";
import { cn, formatPrice } from "@/lib/utils";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Hoy" };

function Tile({
  href,
  icon: Icon,
  label,
  value,
  detail,
  alert,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-card p-4 transition-colors hover:bg-secondary/60",
        alert ? "border-primary" : "border-border"
      )}
    >
      <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="font-display text-[26px] font-semibold leading-none tabular-nums text-foreground">
        {value}
      </span>
      {detail && <span className="text-[13px] text-muted-foreground">{detail}</span>}
    </Link>
  );
}

/**
 * Inicio del panel. El dueño/administrador ve el día de un vistazo y salta a
 * donde haga falta; mesero y cocina van directo a su pantalla de trabajo.
 */
export default async function TodayPage() {
  await connection();
  const session = await getMyRestaurant();
  if (session.role === "KITCHEN") redirect("/kitchen");
  if (!isManager(session.role)) redirect("/orders");

  const restaurantId = session.restaurant.id;
  const [summary, settings, sales] = await Promise.all([
    getDashboardSummary(restaurantId),
    getRestaurantSettings(restaurantId),
    getSalesReport(restaurantId, 1),
  ]);
  const cashOpen = settings.billing_enabled ? !!(await getOpenCashSessionId(restaurantId)) : null;

  const waiting = summary.pending_orders + summary.pending_calls;
  const inKitchen = summary.accepted_orders + summary.preparing_orders;

  return (
    <main>
      <PageHeader title="Hoy" description={session.restaurant.name} />
      <div className="flex flex-col gap-6 px-4 pb-10 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tile
            href="/orders"
            icon={ClipboardList}
            label="Por atender"
            value={String(waiting)}
            detail={`${summary.pending_orders} pedidos · ${summary.pending_calls} llamadas`}
            alert={waiting > 0}
          />
          <Tile
            href="/kitchen"
            icon={ChefHat}
            label="En cocina"
            value={String(inKitchen)}
            detail={`${summary.ready_orders} listos para llevar`}
            alert={summary.ready_orders > 0}
          />
          <Tile
            href="/tables"
            icon={LayoutGrid}
            label="Mesas ocupadas"
            value={`${summary.occupied_tables}/${summary.total_tables}`}
          />
          <Tile
            href="/sales"
            icon={TrendingUp}
            label="Vendido hoy"
            value={formatPrice(Number(sales.summary.total_sold))}
            detail={`${sales.summary.tickets} ${sales.source === "bills" ? "cuentas" : "pedidos"}`}
          />
          {cashOpen !== null && (
            <Tile
              href="/cash"
              icon={Wallet}
              label="Caja"
              value={cashOpen ? "Abierta" : "Cerrada"}
              detail={
                sales.open_bills && sales.open_bills.count > 0
                  ? `${sales.open_bills.count} por cobrar · ${formatPrice(Number(sales.open_bills.total))}`
                  : "Sin cuentas por cobrar"
              }
              alert={!cashOpen && (sales.open_bills?.count ?? 0) > 0}
            />
          )}
        </div>

        {sales.top_products.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lo más pedido hoy
            </h2>
            <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
              {sales.top_products.slice(0, 5).map((p) => (
                <li key={p.name} className="flex justify-between px-4 py-2 text-[14px]">
                  <span className="text-foreground">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">×{p.quantity}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
