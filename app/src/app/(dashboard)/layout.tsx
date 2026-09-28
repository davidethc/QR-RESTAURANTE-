import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getMyRestaurant } from "@/lib/queries/staff";
import {
  classifyMyRestaurantError,
  type MyRestaurantFailure,
} from "@/lib/my-restaurant-error";
import type { MyRestaurant } from "@/types/staff";
import { DashboardLoadError } from "./_components/dashboard-load-error";
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

  // Solo se manda a /login cuando de verdad no hay a quién mostrarle el
  // panel (sin sesión, o sin restaurante / desactivado). Un fallo pasajero
  // de la base o de la red muestra un error recuperable: antes cualquier
  // error sacaba al personal a /login a mitad de servicio.
  let session: MyRestaurant | null = null;
  let failure: MyRestaurantFailure | null = null;
  try {
    session = await getMyRestaurant();
  } catch (error) {
    failure = classifyMyRestaurantError(error);
    if (failure === "transient") console.error("[DashboardLayout] getMyRestaurant", error);
  }

  if (failure === "unauthenticated") redirect("/login?motivo=sesion");
  if (failure === "no-restaurant") redirect("/login?motivo=sin-restaurante");
  if (!session) return <DashboardLoadError />;

  return (
    <div data-theme="admin" className="min-h-full md:pl-16 lg:pl-60 print:pl-0">
      <DashboardNotifier
        restaurantId={session.restaurant.id}
        role={session.role}
      />
      <DashboardNav session={session} />
      <ChargeSheetProvider role={session.role}>
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
