import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { getClosedBillsToday } from "@/lib/queries/cash";
import { listOpenBills } from "@/lib/actions/billing";
import { getCashSessionSummary, getLastCashFloat } from "@/lib/actions/cash";
import { getPublicMenu } from "@/lib/queries/menu";
import { getTopProducts } from "@/lib/queries/staff";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { CashPageLive } from "./_components/cash-page-live";
import { CashSessionArea } from "./_components/cash-session-area";
import { ClosedBillsToday } from "./_components/closed-bills-today";
import { CashTabs } from "./_components/cash-tabs";
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
  requireRouteAccess(session, "/cash");
  const role = session.role;
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
            description={
              role === "OWNER"
                ? "Actívalo en Configuración → Cobro y caja para abrir caja y cobrar cuentas desde aquí."
                : "Pídele al dueño que lo active en Configuración → Cobro y caja."
            }
          />
          {role === "OWNER" && (
            <div className="flex justify-center">
              <Button asChild>
                <Link href="/settings">Ir a Configuración</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    );
  }

  const [registersResult, closedBillsToday] = await Promise.all([
    getLastCashFloat(restaurantId),
    getClosedBillsToday(restaurantId),
  ]);
  const registers = registersResult.ok ? registersResult.data : [];
  const openSessionIds = registers.flatMap((r) => (r.open_session_id ? [r.open_session_id] : []));

  const [summaryResults, openBillsResult, menu, topProducts] = await Promise.all([
    Promise.all(openSessionIds.map((id) => getCashSessionSummary(id))),
    listOpenBills(restaurantId),
    getPublicMenu(session.restaurant.slug),
    getTopProducts(restaurantId),
  ]);

  const summaries = summaryResults
    .map((r) => (r.ok ? r.data : null))
    .filter((s): s is CashSessionSummary => s !== null);
  const openBills = openBillsResult.ok ? openBillsResult.data : [];

  return (
    <main>
      <PageHeader
        title="Caja"
        description={summaries.length > 0 ? "Caja abierta" : "La caja está cerrada"}
        action={<CashPageLive restaurantId={restaurantId} />}
      />
      <CashTabs />
      <div className="flex flex-col gap-8 px-4 pb-12 md:px-8">
        <OfflineBanner message="No se puede cobrar ni registrar pagos hasta que vuelva la red." />
        <CashSessionArea
          summaries={summaries}
          registers={registers}
          timeZone={session.restaurant.timezone}
        />

        <QuickSaleSheet
          categories={menu.categories}
          topProducts={topProducts}
          maxWaiterDiscountPct={settings.max_waiter_discount_pct}
          hasOpenSession={summaries.length > 0}
        />

        <OpenBillsList bills={openBills} maxWaiterDiscountPct={settings.max_waiter_discount_pct} />

        <ClosedBillsToday bills={closedBillsToday} timeZone={session.restaurant.timezone} />
      </div>
    </main>
  );
}
