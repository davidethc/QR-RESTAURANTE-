import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StaffOrderBuilder } from "./_components/staff-order-builder";
import {
  getMyRestaurant,
  getTableForOrder,
  getTopProducts,
} from "@/lib/queries/staff";
import { getPublicMenu } from "@/lib/queries/menu";

// Igual que el resto del panel: fuera del alcance de la migración a
// navegación instantánea, que por ahora solo cubre la ruta del comensal.
export const instant = false;

export const metadata: Metadata = { title: "Tomar pedido" };

/**
 * El mesero le toma el pedido a una mesa.
 *
 * La carta se lee con `getPublicMenu` — la misma que ve el cliente, cacheada
 * y sin sesión de mesa de por medio. Lo que cambia no es el catálogo, es cómo
 * se presenta y quién manda el pedido.
 */
export default async function TakeOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getMyRestaurant();

  // Cocina no toma pedidos en las mesas. El RPC lo rechazaría igual; esto
  // evita que llegue siquiera a ver una pantalla que no puede usar.
  if (session.role === "KITCHEN") notFound();

  const table = await getTableForOrder(id);

  // Comprobar el restaurante no es redundante con la RLS: sin esto, un id de
  // mesa de otro local devolvería null y daría 404 igual, pero dejar la
  // comprobación explícita documenta la regla en el sitio donde importa.
  if (!table || table.restaurant_id !== session.restaurant.id) notFound();
  if (table.status === "INACTIVE") notFound();

  const [menu, topProducts] = await Promise.all([
    getPublicMenu(session.restaurant.slug),
    getTopProducts(session.restaurant.id),
  ]);

  const tableLabel = table.name ?? `Mesa ${table.number}`;

  return (
    <main>
      <PageHeader
        title={tableLabel}
        description="Toma el pedido y pasa directo a cocina"
        action={
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href="/tables">
              <ArrowLeft className="size-4" /> Mesas
            </Link>
          </Button>
        }
      />
      <StaffOrderBuilder
        categories={menu.categories}
        topProducts={topProducts}
        tableId={table.id}
        tableLabel={tableLabel}
      />
    </main>
  );
}
