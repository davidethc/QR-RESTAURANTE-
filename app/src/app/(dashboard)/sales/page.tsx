import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getSalesReport } from "@/lib/queries/staff";
import { isManager } from "@/lib/permissions";
import { RangeTabs, type SalesRange } from "./_components/range-tabs";
import { SalesSummary } from "./_components/sales-summary";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Ventas" };

const RANGE_DAYS: Record<SalesRange, 1 | 7 | 30> = { hoy: 1, "7d": 7, "30d": 30 };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect("/orders");

  const { range: rawRange } = await searchParams;
  const range: SalesRange = rawRange === "7d" || rawRange === "30d" ? rawRange : "hoy";
  const report = await getSalesReport(session.restaurant.id, RANGE_DAYS[range]);

  return (
    <main>
      <PageHeader
        title="Ventas"
        description="Cuánto vendiste, cómo te pagaron y qué se pidió más."
        action={
          <Button asChild variant="outline" className="h-10">
            <Link href="/reports">
              <BarChart3 /> <span className="hidden sm:inline">Reporte completo</span>
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-8 px-4 pb-12 md:px-8">
        <RangeTabs active={range} />
        <SalesSummary report={report} />
      </div>
    </main>
  );
}
