import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getKitchenTickets } from "@/lib/queries/kds";
import { getPrintingSettings } from "@/lib/actions/printing";
import { KitchenPrintTicket } from "@/components/print/kitchen-ticket";
import { PrintButton } from "@/components/print/print-button";
import { PrintPageStyle } from "@/components/print/print-page-style";
import type { KitchenTicket } from "@/lib/kds";

export const instant = false;

export const metadata: Metadata = { title: "Comanda" };

export default async function KitchenPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  await connection();
  const { ticketId } = await params;
  const { print } = await searchParams;

  const session = await getMyRestaurant();
  requireRouteAccess(session, "/kitchen");

  const [pending, completed, settings] = await Promise.all([
    getKitchenTickets(session.restaurant.id, "pending", 50),
    getKitchenTickets(session.restaurant.id, "completed", 50),
    getPrintingSettings(session.restaurant.id),
  ]);
  const ticket: KitchenTicket | undefined = [...pending.tickets, ...completed.tickets].find(
    (t) => t.ticket_id === ticketId
  );

  if (!ticket) {
    return (
      <main data-caja className="flex min-h-[50vh] items-center justify-center p-6">
        <p role="alert" className="text-body-sm text-destructive">
          No se encontró la comanda. Puede que ya haya salido del historial.
        </p>
      </main>
    );
  }

  return (
    <main data-caja className="flex justify-center bg-secondary/30 px-4 py-8 print:bg-white print:p-0">
      <PrintPageStyle />
      <div className="flex w-full max-w-[340px] flex-col gap-4 print:w-[80mm] print:max-w-none print:gap-0">
        <PrintButton autoPrint={print === "1"} />
        <KitchenPrintTicket
          ticket={ticket}
          fontSize={settings.kitchen_ticket_font_size}
          timeZone={settings.restaurant.timezone}
        />
      </div>
    </main>
  );
}
