import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
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
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <SearchX aria-hidden className="size-6" />
          </span>
          <h1 className="font-display text-title font-bold">Pedido no encontrado</h1>
          <p className="text-body-sm text-muted-foreground">{result.error}</p>
          <Link
            href={`/r/${slug}/${mesa}`}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body font-semibold text-primary-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Volver a la carta
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <OrderTracker
        initialOrder={result.data}
        channelName={channelName}
        initialSessionBill={sessionBillResult.ok ? sessionBillResult.data : null}
      />
      <div
        className="mx-auto w-full max-w-xl px-4"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Link
          href={`/r/${slug}/${mesa}`}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-body-lg font-semibold text-foreground transition-colors duration-150 hover:bg-secondary active:bg-secondary"
        >
          <ArrowLeft aria-hidden className="size-5" />
          Volver a la carta
        </Link>
      </div>
    </main>
  );
}
