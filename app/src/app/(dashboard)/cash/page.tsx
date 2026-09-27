import { canHandleMoney } from "@/lib/permissions";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import {
  getCashRegisters,
  getClosedBillsToday,
  getClosedCashSessions,
  getOpenCashSessionId,
} from "@/lib/queries/cash";
import { listOpenBills } from "@/lib/actions/billing";
import { getCashSessionSummary } from "@/lib/actions/cash";
import { getPublicMenu } from "@/lib/queries/menu";
import { getTopProducts } from "@/lib/queries/staff";
import { CashPageLive } from "./_components/cash-page-live";
import { CashSessionArea } from "./_components/cash-session-area";
import { ClosedBillsToday } from "./_components/closed-bills-today";
import { ClosedSessionsHistory } from "./_components/closed-sessions-history";
import { OpenBillsList } from "./_components/open-bills-list";
import { QuickSaleSheet } from "./_components/quick-sale-sheet";
import type { CashSessionSummary } from "@/types/billing";
import { Wallet } from "lucide-react";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Caja" };

export default async function CashPage() {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();

  const session = await getMyRestaurant();
  const role = session.role;
  // Cobra el administrador/dueño (ver lib/permissions.ts).
  if (!canHandleMoney(role)) {
    redirect("/orders");
  }
  const restaurantId = session.restaurant.id;

  const settings = await getRestaurantSettings(restaurantId);

  if (!settings.billing_enabled) {
    return (
      <main>
        <PageHeader title="Caja" />
        <div className="px-4">
          <EmptyState
            icon={Wallet}
            title="El cobro no está activo"
            description="Este restaurante todavía no usa el módulo de cobro. Pide que lo activen para poder abrir caja y cobrar cuentas desde aquí."
          />
        </div>
      </main>
    );
  }

  // "Cierres anteriores": solo OWNER/ADMIN (el mesero cierra a ciegas y
  // tampoco ve el historial). El mesero ni siquiera dispara estas consultas.
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const [registers, openSessionId, closedSessionRows, closedBillsToday] = await Promise.all([
    getCashRegisters(restaurantId),
    getOpenCashSessionId(restaurantId),
    isAdmin ? getClosedCashSessions(restaurantId, 10) : Promise.resolve([]),
    isAdmin ? getClosedBillsToday(restaurantId) : Promise.resolve([]),
  ]);

  const [summaryResult, openBillsResult, closedSummaryResults, menu, topProducts] = await Promise.all([
    openSessionId ? getCashSessionSummary(openSessionId) : Promise.resolve(null),
    listOpenBills(restaurantId),
    Promise.all(closedSessionRows.map((row) => getCashSessionSummary(row.id))),
    getPublicMenu(session.restaurant.slug),
    getTopProducts(restaurantId),
  ]);

  const summary = summaryResult && summaryResult.ok ? summaryResult.data : null;
  const openBills = openBillsResult.ok ? openBillsResult.data : [];
  const closedSessions = closedSummaryResults
    .map((r) => (r.ok ? r.data : null))
    .filter((s): s is CashSessionSummary => s !== null);

  return (
    <main>
      <PageHeader
        title="Caja"
        description={summary ? "Caja abierta" : "La caja está cerrada"}
        action={<CashPageLive restaurantId={restaurantId} />}
      />
      <div className="flex flex-col gap-6 px-4 pb-10 sm:px-6">
        <CashSessionArea
          summary={summary}
          registers={registers}
          role={role}
          timeZone={session.restaurant.timezone}
        />

        <QuickSaleSheet
          categories={menu.categories}
          topProducts={topProducts}
          maxWaiterDiscountPct={settings.max_waiter_discount_pct}
          hasOpenSession={summary !== null}
        />

        <OpenBillsList bills={openBills} maxWaiterDiscountPct={settings.max_waiter_discount_pct} />

        {isAdmin && (
          <ClosedBillsToday bills={closedBillsToday} timeZone={session.restaurant.timezone} />
        )}

        {isAdmin && (
          <ClosedSessionsHistory sessions={closedSessions} timeZone={session.restaurant.timezone} />
        )}
      </div>
    </main>
  );
}
