import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { SchedulesManager } from "@/components/schedules/schedules-manager";
import { getSchedules } from "@/lib/actions/schedules";
import { getMyRestaurant } from "@/lib/queries/staff";
import { isManager } from "@/lib/permissions";

export const instant = false;
export const metadata: Metadata = { title: "Horarios" };

export default async function SchedulesPage() {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect("/today");
  const result = await getSchedules(session.restaurant.id);

  return (
    <main>
      <PageHeader title="Horarios" description="Define cuándo se pueden pedir los productos de cada categoría."
        action={<Button asChild variant="outline" className="min-h-11"><Link href="/menu">Volver al menú</Link></Button>} />
      <div className="px-4 pb-10 md:px-8">
        <SchedulesManager restaurantId={session.restaurant.id} initialResult={result} />
      </div>
    </main>
  );
}
