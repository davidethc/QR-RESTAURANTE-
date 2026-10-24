import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { LayoutGrid, QrCode, Settings, Wallet } from "lucide-react";
import { getDigitalMenuStatus } from "@/lib/queries/digital-menu";
import { SettingsLinkCards } from "./_components/settings-link-cards";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { SettingsForm } from "./_components/settings-form";
import { ZonesSection } from "./_components/zones-section";
import { getZones } from "@/lib/queries/zones";
import { QrSettingsForm } from "./_components/qr-settings-form";
import { BillingSettingsForm } from "./_components/billing-settings-form";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/settings");
  const [restaurant, zones, menuStatus] = await Promise.all([
    getRestaurantSettings(session.restaurant.id),
    getZones(session.restaurant.id),
    getDigitalMenuStatus(session.restaurant.id),
  ]);

  const canQr = session.role === "OWNER" || session.role === "ADMIN";
  const isOwner = session.role === "OWNER";

  return (
    <main data-caja className="min-h-full bg-background">
      <h1 className="sr-only">Configuración</h1>
      <section
        aria-label="Resumen de la configuración"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <StatusPill tone="info" icon={Settings} title="Configuración" detail={restaurant.name} />
        <div className="flex flex-wrap items-stretch gap-2 sm:border-l sm:border-border sm:pl-4">
          <StatusMetric label="Zonas" value={String(zones.length)} tone={zones.length > 0 ? "info" : "attention"} icon={LayoutGrid} />
          {canQr && (
            <StatusMetric
              label="Pedidos QR"
              value={restaurant.qr_orders_require_approval ? "Con aprobación" : "Directo"}
              tone={restaurant.qr_orders_require_approval ? "attention" : "money-in"}
              icon={QrCode}
            />
          )}
          {isOwner && (
            <StatusMetric
              label="Cobro"
              value={restaurant.billing_enabled ? "Activo" : "Apagado"}
              tone={restaurant.billing_enabled ? "money-in" : "neutral"}
              icon={Wallet}
            />
          )}
        </div>
      </section>
      <div className="grid items-start gap-4 px-4 pb-10 pt-4 md:px-5 xl:grid-cols-2">
        <SettingsLinkCards menuStatus={menuStatus} className="xl:col-span-2" />
        <SettingsForm restaurant={restaurant} />
        <div className="flex flex-col gap-4">
          {canQr && <QrSettingsForm restaurant={restaurant} />}
          {isOwner && <BillingSettingsForm restaurant={restaurant} />}
        </div>
        <ZonesSection restaurantId={session.restaurant.id} zones={zones} className="xl:col-span-2" />
      </div>
    </main>
  );
}
