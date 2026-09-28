import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { canHandleMoney } from "@/lib/permissions";
import { getMyRestaurant, getRestaurantSettings } from "@/lib/queries/staff";
import { getBill } from "@/lib/actions/billing";
import { fromCents, splitIncludedTax, toCents } from "@/lib/money";
import { formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { PrintButton } from "./_components/print-button";
import type { BillPayment } from "@/types/billing";

// Mismo patrón que el resto del panel (ver la nota en (dashboard)/layout.tsx):
// sin esto, el Date.now() interno de auth-js rompe el prerender.
export const instant = false;

export const metadata: Metadata = { title: "Ticket" };

/** Precios de la carta con IVA incluido (decisión del dueño, 2026-09-27). */
const IVA_RATE_PCT = 15;

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
  // Solo cobra el administrador/dueño (lib/permissions.ts): el mesero que
  // llegue a esta URL a mano se va a Pedidos, igual que en /cash.
  if (!canHandleMoney(session.role)) {
    redirect("/orders");
  }

  const [billResult, settings] = await Promise.all([
    getBill(billId),
    getRestaurantSettings(session.restaurant.id),
  ]);

  if (!billResult.ok) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6">
        <p role="alert" className="text-body-sm text-destructive">
          {billResult.error}
        </p>
      </main>
    );
  }

  const bill = billResult.data;
  const timeZone = settings.timezone;
  // Solo mientras sigue OPEN (todavía por cobrar) es una pre-cuenta. PAID
  // (ya cobrada, esperando que salgan los pedidos en curso para liberar la
  // mesa) y CLOSED se imprimen como el ticket final: ya no hay saldo.
  const isPreAccount = bill.status === "OPEN";
  const tableLabel = bill.place_label ?? bill.table_name ?? `Mesa ${bill.table_number}`;

  const dateFormatter = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const timestamp = bill.closed_at ?? bill.paid_at ?? new Date().toISOString();

  const { baseCents, taxCents } = splitIncludedTax(toCents(bill.total), IVA_RATE_PCT);
  const billableItems = bill.orders.filter((o) => o.billable).flatMap((o) => o.items);
  const completedPayments = bill.payments.filter((p) => p.status === "COMPLETED");

  return (
    <main className="flex justify-center bg-secondary/30 px-4 py-8 print:bg-white print:p-0">
      {/* La impresora es de 80mm de ancho continuo (sin alto fijo): "auto"
          deja que el navegador corte el largo según el contenido. */}
      <style>{`@page { size: 80mm auto; margin: 0; }`}</style>

      <div className="flex w-full max-w-[320px] flex-col gap-4 print:w-[80mm] print:max-w-none print:gap-0">
        <PrintButton autoPrint={print === "1"} />

        {/* Blanco y negro a propósito, sin importar el tema de la pantalla:
            esto sale de una impresora térmica, no se lee en un monitor.
            72mm de ancho útil dentro del rollo de 80mm (print:mx-auto lo
            centra, dejando ~4mm de aire a cada lado). */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white p-4 font-mono text-caption leading-snug text-black shadow-card print:mx-auto print:w-[72mm] print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <div className="flex flex-col items-center gap-0.5 text-center">
            <p className="text-body-sm font-bold uppercase">{settings.name}</p>
            {settings.address && <p>{settings.address}</p>}
            {settings.phone && <p>Tel. {settings.phone}</p>}
          </div>

          <Dashed />

          <div className="flex flex-col gap-0.5">
            <p className="text-center text-meta font-bold">
              {isPreAccount ? "PRE-CUENTA" : "TICKET"}
            </p>
            <p>Cuenta #{bill.bill_number}</p>
            <p>{tableLabel}</p>
            <p>Fecha: {dateFormatter.format(new Date(timestamp))}</p>
          </div>

          <Dashed />

          <div className="flex flex-col gap-1">
            {billableItems.length === 0 && <p>Sin ítems facturables.</p>}
            {billableItems.map((item) => (
              <div key={item.id} className="flex flex-col">
                <div className="flex justify-between gap-2">
                  <span>
                    {item.quantity}x {item.product_name}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatPrice(item.subtotal)}</span>
                </div>
                {item.notes && <p className="pl-3 text-tiny">* {item.notes}</p>}
              </div>
            ))}
          </div>

          <Dashed />

          <div className="flex flex-col gap-0.5">
            <Line label="Subtotal" value={formatPrice(bill.subtotal)} />
            {bill.discounts.map((d) => (
              <Line key={d.id} label={`Desc. ${d.reason}`} value={`-${formatPrice(d.amount)}`} />
            ))}
            <Line label="TOTAL" value={formatPrice(bill.total)} bold />
          </div>

          <Dashed />

          <div className="flex flex-col gap-0.5">
            <p className="text-tiny">IVA incluido</p>
            <Line label="Base imponible" value={formatPrice(fromCents(baseCents))} />
            <Line label={`IVA ${IVA_RATE_PCT}%`} value={formatPrice(fromCents(taxCents))} />
          </div>

          {completedPayments.length > 0 && (
            <>
              <Dashed />
              <div className="flex flex-col gap-1.5">
                <p className="text-tiny font-bold uppercase">Pagos</p>
                {completedPayments.map((p) => (
                  <PaymentLines key={p.id} payment={p} />
                ))}
                {bill.tip_total > 0 && (
                  <Line label="Total propinas" value={formatPrice(bill.tip_total)} bold />
                )}
              </div>
            </>
          )}

          {isPreAccount && (
            <>
              <Dashed />
              <Line label="Saldo por pagar" value={formatPrice(bill.balance)} bold big />
            </>
          )}

          <Dashed />

          <div className="flex flex-col items-center gap-1 pt-1 text-center">
            <p>¡Gracias por su visita!</p>
            <p className="text-micro">Comprobante interno — no válido como factura</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function Dashed() {
  return <div className="border-t border-dashed border-black/30 print:border-black/70" aria-hidden />;
}

function Line({
  label,
  value,
  bold,
  big,
}: {
  label: string;
  value: string;
  bold?: boolean;
  big?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 ${bold ? "font-bold" : ""} ${big ? "text-body-sm" : ""}`}
    >
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

function PaymentLines({ payment }: { payment: BillPayment }) {
  const label = payment.reference
    ? `${PAYMENT_METHOD_LABEL[payment.method]} · ${payment.reference}`
    : PAYMENT_METHOD_LABEL[payment.method];

  return (
    <div className="flex flex-col">
      <Line label={label} value={formatPrice(payment.amount)} />
      {payment.tip_amount > 0 && <Line label="  Propina" value={formatPrice(payment.tip_amount)} />}
      {payment.method === "CASH" && payment.tendered_amount != null && (
        <>
          <Line label="  Recibido" value={formatPrice(payment.tendered_amount)} />
          <Line label="  Vuelto" value={formatPrice(payment.change_amount ?? 0)} />
        </>
      )}
    </div>
  );
}
