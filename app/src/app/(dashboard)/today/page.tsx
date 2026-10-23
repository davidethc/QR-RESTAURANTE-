import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import {
  Bell,
  BellRing,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Inbox,
  LayoutGrid,
  Lock,
  PackageCheck,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import {
  getDashboardSummary,
  getMyRestaurant,
  getRestaurantSettings,
  getSalesReport,
} from "@/lib/queries/staff";
import { getOpenCashSessionId } from "@/lib/queries/cash";
import { canAccessRoute, canHandleMoney, hasPermission, isManager } from "@/lib/permissions";
import { formatPrice } from "@/lib/utils";
import { AttentionRow, QuickAction, TodaySection } from "./_components/today-blocks";
import { TodayNewOrder } from "./_components/today-new-order";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Hoy" };

/**
 * Inicio compartido: arriba las cifras del día en tarjetas (como Caja),
 * después lo que necesita atención ahora con su acción, los accesos
 * rápidos y el resumen. Solo datos que ya existían; las ventas se
 * consultan únicamente con su permiso específico.
 */
export default async function TodayPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/today");

  const restaurantId = session.restaurant.id;
  const [summary, settings, sales] = await Promise.all([
    getDashboardSummary(restaurantId),
    getRestaurantSettings(restaurantId),
    hasPermission(session, "sales.view") ? getSalesReport(restaurantId, 1) : Promise.resolve(null),
  ]);
  const cashOpen = settings.billing_enabled && hasPermission(session, "cash.manage") ? !!(await getOpenCashSessionId(restaurantId)) : null;

  const canOrders = canAccessRoute(session, "/orders");
  const canKitchen = canAccessRoute(session, "/kitchen");
  const canTables = canAccessRoute(session, "/tables");
  const canCash = canAccessRoute(session, "/cash");
  const canSales = canAccessRoute(session, "/sales");
  // Misma regla que Caja para "Nuevo pedido" (la vuelve a exigir getOrderBuilderData).
  const canTakeOrders = isManager(session) || hasPermission(session, "tables") || hasPermission(session, "pos");

  const inKitchen = summary.accepted_orders + summary.preparing_orders;
  const openBills = sales?.open_bills ?? null;
  const today = new Intl.DateTimeFormat("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: session.restaurant.timezone,
  }).format(new Date());

  const alerts = [
    canOrders && {
      key: "pending",
      href: "/orders",
      icon: Inbox,
      tone: "attention" as const,
      count: summary.pending_orders,
      title: "Pedidos por aprobar",
      detail: summary.pending_orders > 0 ? "Llegaron por QR o esperan aceptación" : "Nada esperando aprobación",
      cta: "Aprobar",
    },
    canOrders && {
      key: "calls",
      href: "/orders?view=calls",
      icon: BellRing,
      tone: "attention" as const,
      count: summary.pending_calls,
      title: "Mesas llamando",
      detail: summary.pending_calls > 0 ? "Llaman al mesero o piden la cuenta" : "Ninguna mesa está llamando",
      cta: "Atender",
    },
    canOrders && {
      key: "ready",
      href: settings.kitchen_ready_step ? "/orders?view=ready" : "/orders?view=progress",
      icon: PackageCheck,
      tone: "money-in" as const,
      count: summary.ready_orders,
      title: "Listos para entregar",
      detail: summary.ready_orders > 0 ? "Cocina ya los terminó" : "Nada esperando en el pase",
      cta: "Entregar",
    },
    openBills && (canCash || canSales) && {
      key: "bills",
      href: canCash ? "/cash" : "/sales",
      icon: Receipt,
      tone: "attention" as const,
      count: openBills.count,
      title: "Cuentas por cobrar",
      detail: openBills.count > 0 ? `${formatPrice(Number(openBills.total))} sin cobrar` : "Todas las cuentas cobradas",
      cta: "Cobrar",
    },
  ].filter((a): a is Exclude<typeof a, false | null> => Boolean(a));
  const pendingAlerts = alerts.filter((a) => a.count > 0).length;

  const actions = [
    canOrders && { href: "/orders", icon: ClipboardList, title: "Pedidos", description: "Aprobar, seguir y entregar", tone: "attention" as const },
    canTables && { href: "/tables", icon: LayoutGrid, title: "Mesas", description: "Abrir mesa y tomar pedido", tone: "info" as const },
    canKitchen && { href: "/kitchen", icon: ChefHat, title: "Cocina", description: "Comandas en preparación", tone: "info" as const },
    canCash && { href: "/cash", icon: Wallet, title: "Caja", description: "Cobrar y cerrar turno", tone: "money-in" as const },
    canSales && { href: "/sales", icon: TrendingUp, title: "Ventas", description: "Lo vendido y por método", tone: "neutral" as const },
  ].filter((a): a is Exclude<typeof a, false> => Boolean(a));

  return (
    <main data-caja className="min-h-full bg-background">
      <h1 className="sr-only">Hoy</h1>
      <section
        aria-label="Cifras de hoy"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <StatusPill
          tone={pendingAlerts > 0 ? "attention" : "money-in"}
          icon={CalendarDays}
          title={session.restaurant.name}
          detail={today.charAt(0).toUpperCase() + today.slice(1)}
        />
        <div className="flex flex-wrap items-stretch gap-2 border-border sm:border-l sm:pl-4">
          <StatusMetric label="Pedidos hoy" value={String(summary.orders_today)} tone="info" icon={ClipboardList} />
          {canKitchen || canOrders ? (
            <StatusMetric label="En cocina" value={String(inKitchen)} tone={inKitchen > 0 ? "info" : "neutral"} icon={ChefHat} />
          ) : null}
          <StatusMetric
            label="Mesas ocupadas"
            value={`${summary.occupied_tables}/${summary.total_tables}`}
            tone={summary.occupied_tables > 0 ? "attention" : "neutral"}
            icon={LayoutGrid}
          />
          {sales && (
            <StatusMetric label="Vendido hoy" value={formatPrice(Number(sales.summary.total_sold))} tone="money-in" icon={TrendingUp} />
          )}
          {cashOpen !== null && (
            <StatusMetric
              label="Caja"
              value={cashOpen ? "Abierta" : "Cerrada"}
              tone={cashOpen ? "money-in" : (openBills?.count ?? 0) > 0 ? "money-out" : "neutral"}
              icon={Lock}
            />
          )}
        </div>
      </section>

      <div className="grid items-start gap-4 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {alerts.length > 0 && (
          <TodaySection
            id="today-attention"
            title="Necesita atención ahora"
            icon={Bell}
            aside={
              <span
                className={
                  pendingAlerts > 0
                    ? "rounded-full border border-attention-border bg-attention-soft px-2 py-0.5 text-caption font-semibold text-attention-soft-foreground"
                    : "rounded-full border border-money-in-border bg-money-in-soft px-2 py-0.5 text-caption font-semibold text-money-in-soft-foreground"
                }
              >
                {pendingAlerts > 0 ? `${pendingAlerts} con pendientes` : "Todo al día"}
              </span>
            }
          >
            <ul className="flex flex-col gap-2 p-3">
              {alerts.map(({ key, ...a }) => (
                <AttentionRow key={key} {...a} />
              ))}
            </ul>
          </TodaySection>
        )}

        <TodaySection id="today-actions" title="Acciones rápidas" icon={Zap} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-col gap-2 p-3">
            {canTakeOrders && <TodayNewOrder canCharge={canHandleMoney(session)} billingEnabled={settings.billing_enabled} />}
            {actions.length > 0 && (
              <ul className="flex flex-col gap-2">
                {actions.map((a) => (
                  <QuickAction key={a.href} {...a} />
                ))}
              </ul>
            )}
          </div>
        </TodaySection>
        <TodaySection id="today-summary" title="Resumen de hoy" icon={Sparkles} className="lg:col-start-1">
          <dl className="grid grid-cols-2 divide-border border-b border-border sm:grid-cols-4 sm:divide-x">
            <SummaryFact label="Pedidos" value={String(summary.orders_today)} />
            <SummaryFact label="En cocina" value={String(inKitchen)} />
            {sales ? (
              <>
                <SummaryFact label={sales.source === "bills" ? "Cuentas cobradas" : "Pedidos entregados"} value={String(sales.summary.tickets)} />
                <SummaryFact label="Ticket promedio" value={formatPrice(Number(sales.summary.avg_ticket))} />
              </>
            ) : (
              <>
                <SummaryFact label="Listos" value={String(summary.ready_orders)} />
                <SummaryFact label="Mesas libres" value={String(Math.max(0, summary.total_tables - summary.occupied_tables))} />
              </>
            )}
          </dl>
          {sales && sales.top_products.length > 0 ? (
            <div className="flex flex-col gap-2 px-4 py-3">
              <h3 className="text-meta font-semibold text-muted-foreground">Lo más pedido</h3>
              <ol className="flex flex-col divide-y divide-border rounded-control border border-border">
                {sales.top_products.slice(0, 5).map((p, i) => (
                  <li key={p.name} className="flex items-center gap-3 px-3 py-2.5 text-body-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-caption font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">×{p.quantity}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="px-4 py-4 text-meta text-muted-foreground">
              {sales ? "Todavía no hay ventas hoy. Lo más pedido aparece aquí." : "Los detalles de ventas los ve quien tiene acceso a Ventas."}
            </p>
          )}
        </TodaySection>
      </div>
    </main>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-lead font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
