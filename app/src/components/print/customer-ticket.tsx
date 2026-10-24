import { formatPrice } from "@/lib/utils";
import { customerFontPx, formatTicketDateTime, hasPromo, linePromoDiscount, textLines, ticketTitle } from "@/lib/printing";
import type { PrintingSettings, TicketBill } from "@/types/printing";

type Header = Pick<
  PrintingSettings,
  "customer_ticket_font_size" | "customer_ticket_header" | "customer_ticket_footer" | "restaurant"
>;

/**
 * Customer ticket, black on white. Money comes exactly as the bill returned
 * it: nothing is added or subtracted here. `framed` draws the on-screen paper.
 */
export function CustomerTicket({ settings, bill, framed = true }: { settings: Header; bill: TicketBill; framed?: boolean }) {
  const { restaurant } = settings;
  const header = textLines(settings.customer_ticket_header);
  const footer = textLines(settings.customer_ticket_footer);
  const title = ticketTitle(bill.status);
  const isPre = title === "PRE-CUENTA";

  return (
    <div
      data-print-root
      style={{ fontSize: customerFontPx(settings.customer_ticket_font_size) }}
      className={
        "flex flex-col gap-[0.75em] bg-white font-mono leading-snug text-black print:mx-auto print:w-[72mm] print:rounded-none print:border-0 print:p-0 print:shadow-none " +
        (framed ? "rounded-2xl border border-border/60 p-4 shadow-card" : "")
      }
    >
      <div className="flex flex-col items-center gap-[0.2em] text-center">
        {restaurant.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- thermal print: plain <img>, grayscale, no optimizer
          <img
            src={restaurant.logo_url}
            alt=""
            className="mb-1 max-h-[4.5em] max-w-[60%] object-contain grayscale contrast-125"
          />
        )}
        <p className="text-[1.15em] font-bold uppercase">{restaurant.name}</p>
        {header.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        {restaurant.address && <p>{restaurant.address}</p>}
        {restaurant.phone && <p>Tel. {restaurant.phone}</p>}
      </div>

      <Dashed />

      <div className="flex flex-col gap-[0.2em]">
        <p className="text-center font-bold">{title}</p>
        <p>Cuenta #{bill.bill_number}</p>
        <p>{bill.place_label}</p>
        <p>{formatTicketDateTime(bill.timestamp, restaurant.timezone)}</p>
      </div>

      <Dashed />

      <div className="flex flex-col gap-[0.35em]">
        {bill.lines.length === 0 && <p>Sin ítems facturables.</p>}
        {bill.lines.map((line) => (
          <div key={line.id} className="flex flex-col">
            <Row
              label={`${line.quantity}x ${line.product_name}${line.variant_name ? ` (${line.variant_name})` : ""}`}
              value={formatPrice(line.subtotal)}
            />
            {(line.options ?? []).map((o, k) => (
              <p key={k} className="pl-[1.2em] text-[0.85em]">
                + {o.qty > 1 ? `${o.qty}x ` : ""}
                {o.value_name}
                {o.price_modifier ? ` (${formatPrice(o.price_modifier * o.qty)})` : ""}
              </p>
            ))}
            {hasPromo(line) && (
              <p className="pl-[1.2em] text-[0.85em]">
                Promo -{formatPrice(linePromoDiscount(line))} (lista {formatPrice(line.list_subtotal ?? 0)})
              </p>
            )}
            {line.notes && <p className="pl-[1.2em] text-[0.85em]">* {line.notes}</p>}
          </div>
        ))}
      </div>

      <Dashed />

      <div className="flex flex-col gap-[0.2em]">
        <Row label="Subtotal" value={formatPrice(bill.subtotal)} />
        {bill.promo_discount_total > 0 && (
          <p className="text-[0.85em]">Incluye promociones: -{formatPrice(bill.promo_discount_total)}</p>
        )}
        {bill.discounts.map((d) => (
          <Row key={d.id} label={`Desc. ${d.reason}`} value={`-${formatPrice(d.amount)}`} />
        ))}
        <Row label="TOTAL" value={formatPrice(bill.total)} bold />
      </div>

      {bill.tax && (
        <>
          <Dashed />
          <div className="flex flex-col gap-[0.2em]">
            <p className="text-[0.85em]">IVA incluido</p>
            <Row label="Base imponible" value={formatPrice(bill.tax.base)} />
            <Row label={`IVA ${bill.tax.ratePct}%`} value={formatPrice(bill.tax.tax)} />
          </div>
        </>
      )}

      {bill.payments.length > 0 && (
        <>
          <Dashed />
          <div className="flex flex-col gap-[0.4em]">
            <p className="text-[0.85em] font-bold uppercase">Pagos</p>
            {bill.payments.map((p) => (
              <div key={p.id} className="flex flex-col">
                <Row label={p.label} value={formatPrice(p.amount)} />
                {p.tip_amount > 0 && <Row label="  Propina" value={formatPrice(p.tip_amount)} />}
                {p.tendered_amount != null && (
                  <>
                    <Row label="  Recibido" value={formatPrice(p.tendered_amount)} />
                    <Row label="  Vuelto" value={formatPrice(p.change_amount ?? 0)} />
                  </>
                )}
              </div>
            ))}
            {bill.tip_total > 0 && <Row label="Total propinas" value={formatPrice(bill.tip_total)} bold />}
          </div>
        </>
      )}

      {isPre && (
        <>
          <Dashed />
          <Row label="Saldo por pagar" value={formatPrice(bill.balance)} bold />
        </>
      )}

      <Dashed />

      <div className="flex flex-col items-center gap-[0.25em] pt-1 text-center">
        {footer.length > 0 ? footer.map((l, i) => <p key={i}>{l}</p>) : <p>¡Gracias por su visita!</p>}
        <p className="text-[0.75em]">Comprobante interno — no válido como factura</p>
      </div>
    </div>
  );
}

function Dashed() {
  return <div className="border-t border-dashed border-black/40 print:border-black/80" aria-hidden />;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
