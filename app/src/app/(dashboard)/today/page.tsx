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
  pill,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value?: string;
  detail?: string;
  pill?: { text: string; tone: "success" | "warning" | "muted" };
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 p-5 text-left transition-colors duration-150 hover:bg-secondary/60"
    >
      <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
        <Icon className="size-[15px]" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </span>
      {pill ? (
        <span
          className={cn(
            "w-fit rounded-badge px-2.5 py-0.5 text-meta font-medium",
            pill.tone === "success" && "bg-success-soft text-success-soft-foreground",
            pill.tone === "warning" && "bg-warning-soft text-warning-soft-foreground",
            pill.tone === "muted" && "bg-muted text-muted-foreground"
          )}
        >
          {pill.text}
        </span>
      ) : (
        <span className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
          {value}
        </span>
      )}
      {detail && <span className="text-caption text-muted-foreground">{detail}</span>}
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
      <div className="flex flex-col gap-8 px-4 pb-12 md:px-8">
        <div
          className={cn(
            "grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-card border border-border bg-card sm:grid-cols-3",
            cashOpen !== null ? "lg:grid-cols-5" : "lg:grid-cols-4"
          )}
        >
          <Tile
            href="/orders"
            icon={ClipboardList}
            label="Por atender"
            value={String(waiting)}
            detail={`${summary.pending_orders} pedidos · ${summary.pending_calls} llamadas`}
          />
          <Tile
            href="/kitchen"
            icon={ChefHat}
            label="En cocina"
            value={String(inKitchen)}
            detail={`${summary.ready_orders} listos para llevar`}
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
              pill={{
                text: cashOpen ? "Abierta" : "Cerrada",
                tone: cashOpen ? "success" : !cashOpen && (sales.open_bills?.count ?? 0) > 0 ? "warning" : "muted",
              }}
              detail={
                sales.open_bills && sales.open_bills.count > 0
                  ? `${sales.open_bills.count} por cobrar · ${formatPrice(Number(sales.open_bills.total))}`
                  : "Sin cuentas por cobrar"
              }
            />
          )}
        </div>

        {sales.top_products.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-body font-semibold text-foreground">Lo más pedido hoy</h2>
            <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
              {sales.top_products.slice(0, 5).map((p) => (
                <li key={p.name} className="flex justify-between px-4 py-3 text-body-sm">
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
