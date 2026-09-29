import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { TablesLive } from "./_components/tables-live";
import { CreateTablesDialog } from "./_components/create-tables-dialog";
import { TablesPdfButton } from "./_components/tables-pdf-button";
import { TablesBoard } from "./_components/tables-board";
import { CartaLinkDialog } from "./_components/carta-link-dialog";
import {
  getMyRestaurant,
  getRestaurantSettings,
  getTablesStatus,
  getActiveTableSessionsMap,
} from "@/lib/queries/staff";
import { toWhatsappNumber } from "@/lib/whatsapp";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Mesas" };

export default async function TablesPage() {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const session = await getMyRestaurant();
  const canManage = session.role === "OWNER" || session.role === "ADMIN";
  // Antes solo se pedía para OWNER/ADMIN (el enlace de WhatsApp de
  // CartaLinkDialog). El módulo de cobro también necesita billing_enabled
  // y el tope de descuento del mesero para CUALQUIER rol que atienda
  // mesas, así que ahora se pide siempre.
  const [tables, settings, tableSessionMap] = await Promise.all([
    getTablesStatus(session.restaurant.id),
    getRestaurantSettings(session.restaurant.id),
    getActiveTableSessionsMap(session.restaurant.id),
  ]);
  /** Quien atiende mesas: toma pedidos, marca la cuenta y libera. */
  const canServeTable =
    session.role === "OWNER" ||
    session.role === "ADMIN" ||
    session.role === "WAITER";

  return (
    <main>
      <PageHeader
        title="Mesas"
        description={`${tables.length} mesas`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <TablesLive restaurantId={session.restaurant.id} />
            {canManage && (
              <>
                <CartaLinkDialog
                  slug={session.restaurant.slug}
                  hasWhatsapp={Boolean(toWhatsappNumber(settings?.phone ?? null))}
                />
                <TablesPdfButton
                  restaurantName={session.restaurant.name}
                  slug={session.restaurant.slug}
                  tables={tables}
                />
                <CreateTablesDialog restaurantId={session.restaurant.id} />
              </>
            )}
          </div>
        }
      />
      <TablesBoard
        tables={tables}
        canManage={canManage}
        canServeTable={canServeTable}
        role={session.role}
        billingEnabled={settings.billing_enabled}
        maxWaiterDiscountPct={settings.max_waiter_discount_pct}
        tableSessionMap={tableSessionMap}
      />
    </main>
  );
}
