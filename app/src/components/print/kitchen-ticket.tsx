import { formatTicketTime, groupKitchenOptions, kitchenFontPx, textLines } from "@/lib/printing";
import { serviceLabel, type KitchenTicket } from "@/lib/kds";
import type { PrintFontSize } from "@/types/printing";

/** Kitchen comanda, black on white, large type: read at arm's length. */
export function KitchenPrintTicket({
  ticket,
  fontSize,
  timeZone,
  framed = true,
}: {
  ticket: KitchenTicket;
  fontSize: PrintFontSize;
  timeZone: string;
  framed?: boolean;
}) {
  const order = ticket.folio ?? ticket.short_code;
  const author = ticket.author_name ?? (ticket.source === "digital_menu" ? "Menú digital" : "Personal");

  return (
    <div
      data-print-root
      style={{ fontSize: kitchenFontPx(fontSize) }}
      className={
        "flex flex-col gap-[0.6em] bg-white font-mono leading-tight text-black print:mx-auto print:w-[72mm] print:rounded-none print:border-0 print:p-0 print:shadow-none " +
        (framed ? "rounded-2xl border border-border/60 p-4 shadow-card" : "")
      }
    >
      <div className="flex flex-col gap-[0.15em] text-center">
        <p className="text-[1.5em] font-bold uppercase">{serviceLabel(ticket)}</p>
        {ticket.customer_name && <p className="font-bold">{ticket.customer_name}</p>}
        <p className="text-[0.8em]">
          {order != null ? `Pedido #${order} · ` : ""}Comanda {ticket.number}
        </p>
        <p className="text-[0.8em]">
          Entró {formatTicketTime(ticket.created_at, timeZone)} · Tomó: {author}
        </p>
      </div>

      <Dashed />

      <ul className="flex flex-col gap-[0.7em]">
        {ticket.lines.map((l) => (
          <li key={l.id} className="flex flex-col">
            <p className="font-bold">
              {l.quantity} x {l.product_name}
              {l.variant_name ? ` · ${l.variant_name}` : ""}
            </p>
            {groupKitchenOptions(l.options).map((g, i) => (
              <p key={i} className="pl-[1em] text-[0.85em]">
                {g.group ? `${g.group.toUpperCase()}: ` : "+ "}
                {g.values.join(" · ")}
              </p>
            ))}
            {l.notes && <p className="pl-[1em] font-bold">** {l.notes} **</p>}
          </li>
        ))}
      </ul>

      {ticket.order_notes && (
        <>
          <Dashed />
          <div>
            <p className="text-[0.75em] uppercase">Nota del pedido</p>
            {textLines(ticket.order_notes).map((line, i) => (
              <p key={i} className="font-bold">
                {line}
              </p>
            ))}
          </div>
        </>
      )}

      <Dashed />
    </div>
  );
}

function Dashed() {
  return <div className="border-t-2 border-dashed border-black/40 print:border-black" aria-hidden />;
}
