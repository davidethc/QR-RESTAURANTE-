import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { isManager } from "@/lib/permissions";
import { SettingsForm } from "./_components/settings-form";
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
  if (!isManager(session.role)) redirect("/orders");
  const restaurant = await getRestaurantSettings(session.restaurant.id);

  return (
    <main>
      <PageHeader
        title="Configuración"
        description="Datos del restaurante que ven tus clientes en la carta."
      />
      <div className="flex flex-col gap-8 px-4 py-4 pb-10">
        <SettingsForm restaurant={restaurant} />
        {session.role === "OWNER" && (
          <section className="flex flex-col gap-3 border-t border-border pt-6">
            <h2 className="font-display text-title-sm font-semibold text-foreground">
              Cobro y caja
            </h2>
            <BillingSettingsForm restaurant={restaurant} />
          </section>
        )}
      </div>
    </main>
  );
}
