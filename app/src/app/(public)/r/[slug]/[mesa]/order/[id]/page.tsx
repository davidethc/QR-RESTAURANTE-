import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrderStatus } from "@/lib/actions/orders";
import { getSessionBill } from "@/lib/actions/billing";
import { OrderTracker } from "./_components/order-tracker";
import { getSessionChannelName } from "@/lib/session-channel";

export const metadata: Metadata = { title: "Tu pedido" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string; mesa: string; id: string }>;
}) {
  // Página personal de cada cliente (lee su cookie de mesa): dinámica. Sin
  // esto Next prerenderiza un shell y aborta las consultas en vuelo al
  // descubrir la cookie ("fetch() rejects when the prerender is complete").
  await connection();
  const { slug, mesa, id } = await params;
  // Un id que ni siquiera es UUID no puede ser un pedido: 404 directo, sin
  // ir a la base (que respondería con un error de tipo de Postgres).
  if (!z.uuid().safeParse(id).success) notFound();
  // En paralelo: ninguna de las tres depende de las otras dos.
  const channelPromise = getSessionChannelName();
  // null si el restaurante no usa cobro o no hay cuenta — el banner
  // "Pagado" simplemente no se muestra en ese caso.
  const sessionBillPromise = getSessionBill();
  const result = await getOrderStatus(id);
  const channelName = await channelPromise;
  const sessionBillResult = await sessionBillPromise;

  if (!result.ok) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Pedido no encontrado</h1>
        <p className="max-w-xs text-muted-foreground">{result.error}</p>
        <Link href={`/r/${slug}/${mesa}`} className="text-sm text-primary underline">
          Volver a la carta
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-full">
      <OrderTracker
        initialOrder={result.data}
        channelName={channelName}
        initialSessionBill={sessionBillResult.ok ? sessionBillResult.data : null}
      />
      <div className="px-4 pb-6">
        <Link
          href={`/r/${slug}/${mesa}`}
          className="block w-full rounded-lg border py-2.5 text-center text-sm font-medium text-foreground"
        >
          Volver a la carta
        </Link>
      </div>
    </main>
  );
}
