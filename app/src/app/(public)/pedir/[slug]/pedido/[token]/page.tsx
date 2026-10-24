import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublicOnlineOrder } from "@/lib/queries/digital-menu";
import { tokenSchema } from "@/lib/digital-menu";
import { OnlineOrderTracker } from "./_components/online-order-tracker";

export const instant = false;
export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

/** M12 · Customer tracking page. The token is the only key; no phone or address is ever returned. */
export default async function OnlineOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  await connection();
  const { slug, token } = await params;
  if (!tokenSchema.safeParse(token).success) notFound();
  const order = await getPublicOnlineOrder(token);
  if (!order || order.restaurant.slug !== slug) notFound();
  return <OnlineOrderTracker initialOrder={order} />;
}
