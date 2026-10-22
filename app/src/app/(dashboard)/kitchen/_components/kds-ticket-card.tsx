"use client";

import { Check, RotateCcw } from "lucide-react";
import { useNow } from "@/components/shared/clock";
import { ActionButton } from "@/components/shared/action-button";
import { formatTimer, serviceLabel, timerTone, type KdsThresholds, type KitchenTicket, type TimerTone } from "@/lib/kds";
import { cn } from "@/lib/utils";

const TONE: Record<TimerTone, string> = {
  green: "bg-success-soft text-success-soft-foreground",
  yellow: "bg-warning-soft text-warning-soft-foreground",
  red: "bg-destructive-soft text-destructive",
};
const TONE_LABEL: Record<TimerTone, string> = {
  green: "En tiempo",
  yellow: "Demorada",
  red: "Muy demorada",
};

/** Cronómetro mm:ss: muestra segundos, así que usa el reloj compartido de 1 s. */
function Timer({ createdAt, thresholds }: { createdAt: string; thresholds: KdsThresholds }) {
  const now = useNow("second");
  if (now === null) return <span className="text-body-lg tabular-nums">—</span>;
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const tone = timerTone(seconds / 60, thresholds);
  return (
    <span
      className={cn("rounded-badge px-3 py-1 text-body-lg font-semibold tabular-nums", TONE[tone])}
      title={TONE_LABEL[tone]}
    >
      <span className="sr-only">{TONE_LABEL[tone]}: </span>
      {formatTimer(seconds)}
    </span>
  );
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function KdsTicketCard({
  ticket,
  thresholds,
  mode,
  action,
  onDone,
}: {
  ticket: KitchenTicket;
  thresholds: KdsThresholds;
  mode: "pending" | "completed";
  action: (ticketId: string) => Promise<import("@/types/actions").ActionResult<unknown>>;
  onDone: () => void;
}) {
  const who = ticket.customer_name ?? "Sin nombre";
  const author = ticket.author_name ?? (ticket.source === "digital_menu" ? "menú digital" : "personal");

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-background p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-title-sm font-semibold leading-tight text-foreground">
            #{ticket.folio ?? ticket.short_code ?? "—"} · Comanda #{ticket.number}
          </p>
          <p className="text-display font-semibold leading-tight text-foreground">
            {serviceLabel(ticket)}
          </p>
          <p className="text-body-sm text-muted-foreground">
            {who} · Tomado por {author} · {clock(ticket.created_at)}
          </p>
        </div>
        {mode === "pending" ? (
          <Timer createdAt={ticket.created_at} thresholds={thresholds} />
        ) : (
          <span className="rounded-badge bg-secondary px-3 py-1 text-body-sm tabular-nums text-foreground">
            Completada {ticket.completed_at ? clock(ticket.completed_at) : ""}
          </span>
        )}
      </header>

      <ul className="flex flex-col gap-2 border-t border-border pt-3">
        {ticket.lines.map((l) => (
          <li key={l.id} className="text-xl leading-snug text-foreground">
            <span className="font-semibold tabular-nums text-primary">{l.quantity} x</span>{" "}
            {l.product_name}
            {l.variant_name && ` - ${l.variant_name}`}
            {l.options.length > 0 && (
              <span className="block text-body-lg text-muted-foreground">
                {l.options
                  .map((o) => `${o.qty && o.qty > 1 ? `${o.qty} x ` : ""}${o.name ?? o.group ?? ""}`)
                  .join(", ")}
              </span>
            )}
            {l.notes && (
              <span className="mt-1 block rounded-control bg-warning-soft px-2 py-1 text-lg font-semibold italic text-warning-soft-foreground">
                Nota: {l.notes}
              </span>
            )}
          </li>
        ))}
      </ul>

      {ticket.order_notes && (
        <p className="rounded-control bg-warning-soft px-2 py-1 text-lg font-semibold text-warning-soft-foreground">
          Nota del pedido: {ticket.order_notes}
        </p>
      )}

      <ActionButton
        action={() => action(ticket.ticket_id)}
        onSuccess={onDone}
        pendingText={mode === "pending" ? "Completando…" : "Devolviendo…"}
        variant={mode === "pending" ? "default" : "outline"}
        className="min-h-11 w-full text-body-lg"
      >
        {mode === "pending" ? (
          <>
            <Check aria-hidden className="size-5" /> Completar comanda
          </>
        ) : (
          <>
            <RotateCcw aria-hidden className="size-5" /> Devolver a preparación
          </>
        )}
      </ActionButton>
    </article>
  );
}
