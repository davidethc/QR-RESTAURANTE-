import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { canHandleMoney } from "@/lib/permissions";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { getReportsTimezoneSettings } from "@/lib/queries/reports";
import { getReportsBundle } from "@/lib/actions/reports";
import { rangeForPreset } from "@/lib/reports-dates";
import { ReportsDashboard } from "./_components/reports-dashboard";
import { Wallet } from "lucide-react";

// Ver la nota en (dashboard)/layout.tsx: el panel entero es `instant = false`.
export const instant = false;

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportsPage() {
  await connection();

  const session = await getMyRestaurant();
  // Reportes muestra dinero: mismo candado que /cash (lib/permissions.ts).
  if (!canHandleMoney(session.role)) {
    redirect("/orders");
  }

  const restaurantId = session.restaurant.id;

  const [settings, tzSettings] = await Promise.all([
    getRestaurantSettings(restaurantId),
    getReportsTimezoneSettings(restaurantId),
  ]);

  if (!settings.billing_enabled) {
    return (
      <main>
        <PageHeader title="Reportes" />
        <div className="px-4 md:px-8">
          <EmptyState
            icon={Wallet}
            title="El cobro no está activo"
            description="Los reportes de venta, propinas y métodos de pago dependen del módulo de cobro. Actívalo para empezar a ver datos aquí."
          />
        </div>
      </main>
    );
  }

  const { timezone, business_day_cutoff } = tzSettings;
  const initialRange = rangeForPreset("last7", timezone, business_day_cutoff);

  const initialBundle = await getReportsBundle({
    restaurantId,
    from: initialRange.from,
    to: initialRange.to,
    granularity: "day",
  });

  return (
    <main className="pb-10">
      <PageHeader
        title="Reportes"
        description="Venta, productos, meseros, pagos y cocina — todo por rango de fechas."
      />
      <div className="px-4 pb-12 md:px-8">
        <ReportsDashboard
          restaurantId={restaurantId}
          restaurantName={session.restaurant.name}
          timezone={timezone}
          businessDayCutoff={business_day_cutoff}
          initialRange={initialRange}
          initialBundle={initialBundle}
        />
      </div>
    </main>
  );
}
