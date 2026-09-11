import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { SettingsForm } from "./_components/settings-form";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const session = await getMyRestaurant();
  const restaurant = await getRestaurantSettings(session.restaurant.id);

  return (
    <main>
      <PageHeader
        title="Configuración"
        description="Datos del restaurante que ven tus clientes en la carta."
      />
      <div className="px-4 py-4">
        <SettingsForm restaurant={restaurant} />
      </div>
    </main>
  );
}
