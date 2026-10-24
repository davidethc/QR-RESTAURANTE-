import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getBill } from "@/lib/actions/billing";
import { getPrintingSettings } from "@/lib/actions/printing";
import { CustomerTicket } from "@/components/print/customer-ticket";
import { PrintButton } from "@/components/print/print-button";
import { PrintPageStyle } from "@/components/print/print-page-style";
import { toTicketBill } from "@/components/print/to-ticket-bill";

// Same pattern as the rest of the panel (see the note in (dashboard)/layout.tsx):
// without this, auth-js's internal Date.now() breaks prerender.
export const instant = false;

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  await connection();
  const { billId } = await params;
  const { print } = await searchParams;

  const session = await getMyRestaurant();
  requireRouteAccess(session, "/cash");

  const [billResult, settings] = await Promise.all([
    getBill(billId),
    getPrintingSettings(session.restaurant.id),
  ]);

  if (!billResult.ok) {
    return (
      <main data-caja className="flex min-h-[50vh] items-center justify-center p-6">
        <p role="alert" className="text-body-sm text-destructive">
          {billResult.error}
        </p>
      </main>
    );
  }

  return (
    <main data-caja className="flex justify-center bg-secondary/30 px-4 py-8 print:bg-white print:p-0">
      <PrintPageStyle />
      <div className="flex w-full max-w-[320px] flex-col gap-4 print:w-[80mm] print:max-w-none print:gap-0">
        <PrintButton autoPrint={print === "1"} />
        <CustomerTicket settings={settings} bill={toTicketBill(billResult.data)} />
      </div>
    </main>
  );
}
