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
import { hasPermission, isManager } from "@/lib/permissions";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { CashPageLive } from "./_components/cash-page-live";
import { CashWorkspace } from "./_components/cash-workspace";
import type { CashSessionSummary } from "@/types/billing";
import { Wallet } from "lucide-react";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Caja" };

/**
 * Caja: punto de venta. Lo que se carga aquí es solo lo necesario para
 * cobrar (cajas, turno, cuentas abiertas, cobradas hoy). La carta del
 * "Nuevo pedido" se pide al abrirlo (lib/actions/order-builder.ts).
 */
export default async function CashPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();

  const session = await getMyRestaurant();
  requireRouteAccess(session, "/cash");
  const role = session.role;
  const restaurantId = session.restaurant.id;
  const canManage = isManager(role);

  const [settings, { cuenta }] = await Promise.all([getRestaurantSettings(restaurantId), searchParams]);

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

  const [registersResult, closedBillsToday, openBillsResult] = await Promise.all([
    getLastCashFloat(restaurantId),
    canManage ? getClosedBillsToday(restaurantId) : Promise.resolve([]),
    listOpenBills(restaurantId),
  ]);
  const registers = registersResult.ok ? registersResult.data : [];
  const openSessionIds = registers.flatMap((r) => (r.open_session_id ? [r.open_session_id] : []));
  const summaryResults = await Promise.all(openSessionIds.map((id) => getCashSessionSummary(id)));
  const summaries = summaryResults
    .map((r) => (r.ok ? r.data : null))
    .filter((s): s is CashSessionSummary => s !== null);

  return (
    <main>
      <h1 className="sr-only">Caja</h1>
      <div className="px-4 pt-2 md:px-6 empty:hidden">
        <OfflineBanner message="No se puede cobrar ni registrar pagos hasta que vuelva la red." />
      </div>
      <CashWorkspace
        summaries={summaries}
        closedRegisters={registers
          .filter((r) => !r.open_session_id)
          .map((r) => ({ id: r.register_id, name: r.register_name, suggestedFloat: r.cash_float_left }))}
        bills={openBillsResult.ok ? openBillsResult.data : []}
        closedToday={closedBillsToday}
        canManage={canManage}
        canTakeOrders={canManage || hasPermission(session, "tables") || hasPermission(session, "pos")}
        billingEnabled={settings.billing_enabled}
        timeZone={session.restaurant.timezone}
        initialSelected={cuenta ?? null}
        live={<CashPageLive restaurantId={restaurantId} />}
      />
    </main>
  );
}
