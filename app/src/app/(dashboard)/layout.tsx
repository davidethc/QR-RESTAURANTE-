import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getMyRestaurant } from "@/lib/queries/staff";
import { DashboardNav } from "./_components/dashboard-nav";
import { DashboardNotifier } from "@/components/shared/dashboard-notifier";
import { GooeyToaster } from "@/components/ui/goey-toaster";
import { ChargeSheetProvider } from "./cash/_components/charge-sheet-host";

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
  // `await cookies()` dentro de `createClient()` ya debería bastar para
  // marcar este render como dinámico, pero `@supabase/ssr` carga la sesión
  // en un tick posterior (un timer interno de `@supabase/auth-js`), fuera
  // de la cadena síncrona que Cache Components rastrea. Ese `Date.now()`
  // diferido, sin `connection()` antes, dispara "Next.js encountered the
  // unstable value Date.now() while prerendering" en TODAS las rutas del
  // panel (comparten este layout) — y con eso, cualquier navegación del
  // lado cliente que pase por él puede quedarse con una versión vieja en
  // vez de la data fresca. `connection()` fuerza el punto dinámico antes
  // de que la sesión se cargue, así ese Date.now() ya no compite con el
  // prerender.
  await connection();

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
      {/* Tope de descuento del mesero: cada página que lo necesita ya lo trae
          de `getRestaurantSettings` y se lo pasa a `openCharge`; traerlo acá
          también obligaría a toda navegación del panel a esperar esa
          consulta aunque la página no cobre nada (settings, menú, cocina).
          0 aquí es solo el default cuando quien abre la hoja no lo pasa. */}
      <ChargeSheetProvider role={session.role} maxWaiterDiscountPct={0}>
        {children}
      </ChargeSheetProvider>
      {/* Solo el panel monta goey-toast (y con él framer-motion): es
          donde los avisos tienen que verse desde el otro lado del
          salón. El comensal se queda con el <Toaster> de sonner del
          layout raíz. print:hidden: al imprimir el ticket de /cash/ticket
          no debe verse un toast (ni su espacio) sobre el papel. */}
      <div className="print:hidden">
        <GooeyToaster
          position="top-center"
          bounce={0.4}
          showProgress
          closeButton
          duration={2000}
        />
      </div>
    </div>
  );
}
