import { redirect } from "next/navigation";
import { getMyRestaurant } from "@/lib/queries/staff";
import { DashboardNav } from "./_components/dashboard-nav";
import { DashboardNotifier } from "@/components/shared/dashboard-notifier";
import { GooeyToaster } from "@/components/ui/goey-toaster";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await getMyRestaurant();
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-full">
      <DashboardNotifier
        restaurantId={session.restaurant.id}
        role={session.role}
      />
      <DashboardNav session={session} />
      {children}
      {/* Solo el panel monta goey-toast (y con él framer-motion): es
          donde los avisos tienen que verse desde el otro lado del
          salón. El comensal se queda con el <Toaster> de sonner del
          layout raíz. */}
      <GooeyToaster
        position="top-center"
        bounce={0.4}
        showProgress
        closeButton
        duration={2000}
      />
    </div>
  );
}
