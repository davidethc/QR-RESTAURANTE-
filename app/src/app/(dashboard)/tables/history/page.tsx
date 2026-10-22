import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getTablesHistory } from "@/lib/queries/tables-panel";
import { HistoryTable } from "./_components/history-table";

export const instant = false;

export const metadata: Metadata = { title: "Historial de mesas" };

export default async function TablesHistoryPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/tables");
  const orders = await getTablesHistory(session.restaurant.id);

  return (
    <main>
      <PageHeader
        title="Historial de mesas"
        description="Pedidos de mesa cerrados o cancelados. Solo consulta."
        action={
          <Button asChild variant="outline" className="h-11 rounded-control">
            <Link href="/tables">
              <ArrowLeft className="size-4" /> Mesas
            </Link>
          </Button>
        }
      />
      <HistoryTable orders={orders} timezone={session.restaurant.timezone} />
    </main>
  );
}
