import Link from "next/link";
import type { Metadata } from "next";
import { getOrderStatus } from "@/lib/actions/orders";
import { OrderTracker } from "./_components/order-tracker";

export const metadata: Metadata = { title: "Tu pedido" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string; mesa: string; id: string }>;
}) {
  const { slug, mesa, id } = await params;
  const result = await getOrderStatus(id);

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
      <OrderTracker initialOrder={result.data} />
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
