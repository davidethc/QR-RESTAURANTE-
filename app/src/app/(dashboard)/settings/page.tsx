import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { SettingsForm } from "./_components/settings-form";
import { ZonesSection } from "./_components/zones-section";
import { getZones } from "@/lib/queries/zones";
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
  const [restaurant, zones] = await Promise.all([
    getRestaurantSettings(session.restaurant.id),
    getZones(session.restaurant.id),
  ]);

  return (
    <main>
      <PageHeader
        title="Configuración"
        description="Datos del restaurante que ven tus clientes en la carta."
      />
      <div className="flex flex-col gap-8 px-4 pb-10 md:px-8">
        <SettingsForm restaurant={restaurant} />
        <ZonesSection restaurantId={session.restaurant.id} zones={zones} />
        {session.role === "OWNER" && <BillingSettingsForm restaurant={restaurant} />}
      </div>
    </main>
  );
}
