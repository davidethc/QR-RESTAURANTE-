import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getZoneWithTables } from "@/lib/queries/zones";
import { isManager } from "@/lib/permissions";
import { FloorEditor } from "./_components/floor-editor";

export const instant = false;

export const metadata: Metadata = { title: "Editor de plano" };

export default async function ZoneEditorPage({
  params,
}: {
  params: Promise<{ zoneId: string }>;
}) {
  await connection();
  const { zoneId } = await params;
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect("/orders");
  const data = await getZoneWithTables(session.restaurant.id, zoneId);
  if (!data) notFound();
  return <FloorEditor zone={data.zone} tables={data.tables} />;
}
