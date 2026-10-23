import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getSecurityOrder } from "@/lib/queries/security";
import { isManager } from "@/lib/permissions";
import { formatPrice } from "@/lib/utils";

export const instant = false;
export default async function SecurityOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect(session.role === "KITCHEN" ? "/kitchen" : "/tables");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await getSecurityOrder(id);
  if (!order) notFound();
  const states: Record<string, string> = { PENDING: "Nuevo", ACCEPTED: "Aceptado", PREPARING: "En preparación", READY: "Listo", DELIVERED: "Entregado", REJECTED: "Cancelado", CANCELLED: "Cancelado" };
  return <main data-caja className="min-h-full bg-background"><PageHeader title={`Pedido #${order.order_number}`} description="Detalle del pedido relacionado con el historial." />
    <div className="flex flex-col gap-5 px-4 pb-10 md:px-8">
      <Button asChild variant="outline" className="min-h-11 w-fit"><Link href="/security"><ArrowLeft aria-hidden /> Volver al historial</Link></Button>
      <section className="max-w-2xl rounded-card border border-border bg-card p-4">
        <h2 className="text-body font-semibold text-foreground">{states[order.status] ?? "Pedido"}</h2>
        <p className="mt-2 text-meta text-muted-foreground">{new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", dateStyle: "long", timeStyle: "short" }).format(new Date(order.created_at))}</p>
        {order.rejection_reason && <p className="mt-3 break-words text-body-sm">Motivo: {order.rejection_reason}</p>}
        <ul className="mt-4 divide-y divide-border">{order.order_items.map((item) => <li key={item.id} className="flex justify-between gap-4 py-3 text-body-sm"><span>{item.quantity} × {item.product_name}</span><span className="tabular-nums">{formatPrice(item.subtotal)}</span></li>)}</ul>
        <p className="mt-3 border-t border-border pt-4 text-body font-semibold">Total: {formatPrice(order.total)}</p>
      </section>
    </div>
  </main>;
}
