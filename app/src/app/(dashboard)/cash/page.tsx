import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { getCashRegisters, getOpenCashSessionId } from "@/lib/queries/cash";
import { listOpenBills } from "@/lib/actions/billing";
import { getCashSessionSummary } from "@/lib/actions/cash";
import { CashPageLive } from "./_components/cash-page-live";
import { OpenCashCard } from "./_components/open-cash-card";
import { CashSessionPanel } from "./_components/cash-session-panel";
import { OpenBillsList } from "./_components/open-bills-list";
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
  if (role !== "OWNER" && role !== "ADMIN" && role !== "WAITER") {
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

  const [registers, openSessionId] = await Promise.all([
    getCashRegisters(restaurantId),
    getOpenCashSessionId(restaurantId),
  ]);

  const [summaryResult, openBillsResult] = await Promise.all([
    openSessionId ? getCashSessionSummary(openSessionId) : Promise.resolve(null),
    listOpenBills(restaurantId),
  ]);

  const summary = summaryResult && summaryResult.ok ? summaryResult.data : null;
  const openBills = openBillsResult.ok ? openBillsResult.data : [];

  return (
    <main>
      <PageHeader
        title="Caja"
        description={summary ? "Caja abierta" : "La caja está cerrada"}
        action={<CashPageLive restaurantId={restaurantId} />}
      />
      <div className="flex flex-col gap-6 px-4 pb-10 sm:px-6">
        {!summary ? (
          <OpenCashCard registers={registers} />
        ) : (
          <CashSessionPanel summary={summary} role={role} timeZone={session.restaurant.timezone} />
        )}

        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cuentas abiertas
          </p>
          <OpenBillsList bills={openBills} role={role} maxWaiterDiscountPct={settings.max_waiter_discount_pct} />
        </div>
      </div>
    </main>
  );
}
