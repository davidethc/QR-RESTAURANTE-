import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { OfflineBanner } from "@/components/shared/offline-banner";
import {
  getMyRestaurant,
  getDashboardSummary,
  getStaffOrders,
  getWaiterCalls,
  getTablesStatus,
  getRestaurantSettings,
  getActiveTableSessionsMap,
} from "@/lib/queries/staff";
import { OrdersBoard } from "./_components/orders-board";
import { QuickTakeOrder } from "./_components/quick-take-order";
import { CounterOrdersPanel } from "./_components/counter-orders-panel";
import { NewOrderButton } from "./_components/new-order-button";
import { getPublicMenu } from "@/lib/queries/menu";
import { getStaffProductDetails } from "@/lib/queries/staff-catalog";
import { getCounterOrders } from "@/lib/queries/counter-orders";
import { canHandleMoney } from "@/lib/permissions";
import { canHandleOnlineOrders, getDigitalMenuStatus, getPendingOnlineOrders } from "@/lib/queries/digital-menu";
import { OnlineOrdersPanel } from "./_components/online-orders-panel";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Pedidos" };

/** "Nuevo pedido" en tamaño de franja (el de Caja ocupa toda la columna). */
const newOrderClass =
  "min-h-12 w-auto rounded-button bg-money-in px-4 text-body font-semibold text-money-in-foreground hover:bg-money-in/90 [&>span]:size-7";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; view?: string }>;
}) {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/orders");
  const restaurantId = session.restaurant.id;
  const { table, view } = await searchParams;
  const initialTableFilter = table ? Number(table) : null;
  /** Igual que en Mesas: quien atiende mesas puede tomar un pedido. */
  const canServeTable =
    session.role === "OWNER" ||
    session.role === "ADMIN" ||
    session.role === "WAITER";

  const [summary, orders, calls, tables, settings, tableSessionMap, onlineOrders, canHandleOnline, menuStatus] = await Promise.all([
    getDashboardSummary(restaurantId),
    getStaffOrders(restaurantId, ["PENDING", "ACCEPTED", "PREPARING", "READY"]),
    getWaiterCalls(restaurantId, ["PENDING", "ACCEPTED"]),
    canServeTable ? getTablesStatus(restaurantId) : Promise.resolve([]),
    // Módulo de cobro (M5): billing_enabled y el tope de descuento del
    // mesero, para el botón "Cobrar" de las llamadas de cuenta (solo si
    // atiende mesas). kitchen_ready_step: pestaña "Listos" y confirmación
    // al entregar, para cualquier rol.
    getRestaurantSettings(restaurantId),
    canServeTable ? getActiveTableSessionsMap(restaurantId) : Promise.resolve({}),
    // M12: pedidos del menú digital por aceptar (sección "En línea").
    getPendingOnlineOrders(restaurantId).catch((e: { message?: string; code?: string }) => {
      console.error("[orders] online orders", e?.code, e?.message);
      return [];
    }),
    canHandleOnlineOrders(restaurantId),
    getDigitalMenuStatus(restaurantId),
  ]);
  const onlineIds = new Set(onlineOrders.map((o) => o.id));
  const showOnline = onlineOrders.length > 0 || (menuStatus !== null && menuStatus !== "inactive");

  const [allCounterOrders, menu, productDetails] = canServeTable
    ? await Promise.all([
        getCounterOrders(restaurantId),
        getPublicMenu(session.restaurant.slug),
        getStaffProductDetails(restaurantId),
      ])
    : [[], { categories: [] }, {}];
  // Un pedido web a domicilio sin aceptar se atiende en "En línea", no aquí.
  const counterOrders = allCounterOrders.filter((o) => !onlineIds.has(o.id));

  const newOrder = canServeTable ? (
    <NewOrderButton
      canCharge={canHandleMoney(session.role)}
      billingEnabled={settings.billing_enabled}
      className={newOrderClass}
    />
  ) : null;

  return (
    <main data-caja className="min-h-full bg-background">
      <h1 className="sr-only">Pedidos</h1>
      <div className="px-4 pt-2 md:px-5 empty:hidden">
        <OfflineBanner />
      </div>
      <OrdersBoard
        restaurantId={restaurantId}
        initialOrders={orders}
        initialCalls={calls}
        initialTableFilter={
          initialTableFilter && !Number.isNaN(initialTableFilter)
            ? initialTableFilter
            : null
        }
        initialView={view === "calls" || view === "progress" || view === "ready" ? view : null}
        summaryDetail={`${summary.orders_today} pedidos hoy · ${summary.occupied_tables}/${summary.total_tables} mesas ocupadas`}
        actions={
          newOrder && (
            <>
              <QuickTakeOrder tables={tables} />
              {newOrder}
            </>
          )
        }
        emptyAction={newOrder}
        role={session.role}
        billingEnabled={canServeTable && settings.billing_enabled}
        maxWaiterDiscountPct={canServeTable ? settings.max_waiter_discount_pct : 0}
        readyStep={settings.kitchen_ready_step}
        tableSessionMap={tableSessionMap}
        onlineSection={
          showOnline ? (
            <OnlineOrdersPanel
              restaurantId={restaurantId}
              initialOrders={onlineOrders}
              canHandle={canHandleOnline}
              menuStatus={menuStatus}
            />
          ) : null
        }
      />
      {canServeTable && (
        <div className="px-4 pb-8 md:px-5">
          <CounterOrdersPanel
            orders={counterOrders}
            categories={menu.categories}
            details={productDetails}
            billingEnabled={settings.billing_enabled}
            canCharge={canHandleMoney(session.role)}
            emptyAction={newOrder}
          />
        </div>
      )}
    </main>
  );
}
