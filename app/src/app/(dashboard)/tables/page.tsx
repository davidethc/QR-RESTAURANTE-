import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { TablesLive } from "./_components/tables-live";
import { CreateTablesDialog } from "./_components/create-tables-dialog";
import { TablesPdfButton } from "./_components/tables-pdf-button";
import { TablesBoardV2 } from "./_components/tables-board-v2";
import { getMyRestaurant, getTablesStatus } from "@/lib/queries/staff";

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
  const tables = await getTablesStatus(session.restaurant.id);
  const canManage = session.role === "OWNER" || session.role === "ADMIN";
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
          <div className="flex items-center gap-2">
            <TablesLive restaurantId={session.restaurant.id} />
            {canManage && (
              <>
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
      <TablesBoardV2
        tables={tables}
        canManage={canManage}
        canServeTable={canServeTable}
      />
    </main>
  );
}
