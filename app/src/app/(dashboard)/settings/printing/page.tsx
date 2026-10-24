import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Printer, Type } from "lucide-react";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getPrintingSettings } from "@/lib/actions/printing";
import { FONT_SIZE_OPTIONS } from "@/lib/printing";
import { PrintingForm } from "./_components/printing-form";

export const instant = false;

export const metadata: Metadata = { title: "Impresión" };

export default async function PrintingSettingsPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/settings/printing");
  const settings = await getPrintingSettings(session.restaurant.id);
  const sizeLabel = (v: string) => FONT_SIZE_OPTIONS.find((o) => o.value === v)?.label ?? v;

  return (
    <main data-caja className="min-h-full bg-background">
      <h1 className="sr-only">Impresión</h1>
      <section
        aria-label="Resumen de la impresión"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <StatusPill tone="info" icon={Printer} title="Impresión" detail={settings.restaurant.name} />
        <div className="flex flex-wrap items-stretch gap-2 sm:border-l sm:border-border sm:pl-4">
          <StatusMetric label="Letra del ticket" value={sizeLabel(settings.customer_ticket_font_size)} tone="neutral" icon={Type} />
          <StatusMetric label="Letra de la comanda" value={sizeLabel(settings.kitchen_ticket_font_size)} tone="neutral" icon={Type} />
        </div>
      </section>
      <PrintingForm restaurantId={session.restaurant.id} settings={settings} />
    </main>
  );
}
