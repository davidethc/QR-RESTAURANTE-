import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { TableStatusBadge } from "@/components/shared/status-badge";
import { TableQrDialog } from "./_components/table-qr-dialog";
import { formatPrice } from "@/lib/utils";
import { getMyRestaurant, getTablesStatus } from "@/lib/queries/staff";

export const metadata: Metadata = { title: "Mesas" };

export default async function TablesPage() {
  const session = await getMyRestaurant();
  const tables = await getTablesStatus(session.restaurant.id);
  const canManage = session.role === "OWNER" || session.role === "ADMIN";

  return (
    <main>
      <PageHeader title="Mesas" description={`${tables.length} mesas`} />
      <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((table) => (
          <Link
            key={table.id}
            href={`/orders?table=${table.number}`}
            className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground">
                {table.name ?? `Mesa ${table.number}`}
              </p>
              <TableStatusBadge status={table.status} />
            </div>

            {(table.active_orders > 0 || table.pending_calls > 0) && (
              <div className="mt-2 flex flex-col gap-0.5 text-sm text-muted-foreground">
                {table.active_orders > 0 && (
                  <span>
                    {table.active_orders} pedido
                    {table.active_orders > 1 ? "s" : ""} activo
                    {table.active_orders > 1 ? "s" : ""}
                  </span>
                )}
                {table.pending_calls > 0 && (
                  <span>
                    {table.pending_calls} solicitud
                    {table.pending_calls > 1 ? "es" : ""} pendiente
                    {table.pending_calls > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {table.active_total > 0 && (
              <p className="mt-2 text-sm font-semibold text-wine">
                {formatPrice(table.active_total)}
              </p>
            )}

            {canManage && (
              <div className="mt-3" onClick={(e) => e.preventDefault()}>
                <TableQrDialog
                  restaurantName={session.restaurant.name}
                  tableLabel={table.name ?? `Mesa ${table.number}`}
                  qrToken={table.qr_token}
                />
              </div>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
