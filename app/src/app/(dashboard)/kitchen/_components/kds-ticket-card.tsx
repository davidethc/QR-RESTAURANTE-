"use client";

import { Check, CircleCheck, Clock, Flame, MessageSquareWarning, RotateCcw, Sparkles, TimerReset } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNow } from "@/components/shared/clock";
import { ActionButton } from "@/components/shared/action-button";
import { toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { formatTimer, serviceLabel, timerTone, type KdsThresholds, type KitchenTicket, type TimerTone } from "@/lib/kds";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types/actions";
import { KitchenPlaceIcon } from "./kitchen-place-icon";

/** Semáforo del cronómetro: color + icono + texto, nunca color solo. */
export const TIMER_META: Record<TimerTone, { tone: PosTone; label: string; icon: LucideIcon }> = {
  green: { tone: "money-in", label: "A tiempo", icon: Clock },
  yellow: { tone: "attention", label: "Demorada", icon: TimerReset },
  red: { tone: "money-out", label: "Atrasada", icon: Flame },
};

/** Banda superior de la comanda: el tono de la banda sigue al cronómetro. */
const BAND: Record<PosTone, string> = {
  "money-in": "bg-card border-border",
  attention: "bg-attention-soft border-attention-border",
  "money-out": "bg-money-out-soft border-money-out-border",
  info: "bg-info-soft border-info-border",
  neutral: "bg-secondary border-border",
};

/** Marco de 2px solo cuando la comanda pide atención o va tarde. */
const FRAME: Record<PosTone, string> = {
  "money-in": "",
  attention: "border-attention-border",
  "money-out": "border-money-out",
  info: "",
  neutral: "",
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function ticketTitle(t: KitchenTicket) {
  const order = t.folio ?? t.short_code;
  return order != null ? `Pedido #${order} · Comanda ${t.number}` : `Comanda ${t.number}`;
}

/**
 * Cabecera: lugar grande con su icono, número de pedido y cronómetro.
 * Es la única parte que se vuelve a pintar cada segundo (reloj compartido,
 * sin un intervalo por tarjeta), y decide el color de la banda.
 */
function TicketHeader({
  ticket,
  thresholds,
  mode,
}: {
  ticket: KitchenTicket;
  thresholds: KdsThresholds;
  mode: "pending" | "completed";
}) {
  const now = useNow("second");
  const pending = mode === "pending";
  const seconds = now === null ? null : Math.max(0, Math.floor((now - new Date(ticket.created_at).getTime()) / 1000));
  const meta = seconds === null ? null : TIMER_META[timerTone(seconds / 60, thresholds)];
  const tone: PosTone = pending ? (meta?.tone ?? "money-in") : "neutral";
  const Icon = meta?.icon ?? Clock;

  return (
    <>
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-card border-2 border-transparent", FRAME[tone])} />
      <header className={cn("flex items-start gap-3 border-b px-4 py-3.5", BAND[tone])}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-control border border-border bg-card text-foreground">
          <KitchenPlaceIcon ticket={ticket} className="size-6" />
        </span>
        <h2 className="min-w-0 flex-1 self-center text-[1.625rem] font-bold leading-tight text-foreground [overflow-wrap:anywhere]">
          {serviceLabel(ticket)}
        </h2>
        {pending ? (
          <span
            className={cn(
              "flex shrink-0 flex-col items-end gap-0.5 rounded-control border px-2.5 py-1.5",
              meta ? toneSoft[meta.tone] : toneSoft.neutral
            )}
          >
            <span className="flex items-center gap-1.5 text-2xl font-bold leading-none tabular-nums">
              <Icon aria-hidden className="size-5" />
              {seconds === null ? "--:--" : formatTimer(seconds)}
            </span>
            <span className="text-caption font-semibold leading-tight">{meta?.label ?? "Calculando"}</span>
          </span>
        ) : (
          <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-body-sm font-semibold", toneSoft["money-in"])}>
            <CircleCheck aria-hidden className="size-4" />
            {ticket.completed_at ? `Lista ${clock(ticket.completed_at)}` : "Lista"}
          </span>
        )}
      </header>
    </>
  );
}

/**
 * Comanda de cocina: lo que hay que preparar en letra grande, con
 * variantes, extras y notas separados, y un único botón grande para
 * avanzarla. En el historial el botón es secundario (devolver).
 */
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
  action: (ticketId: string) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}) {
  const who = ticket.customer_name;
  const author = ticket.author_name ?? (ticket.source === "digital_menu" ? "Menú digital" : "Personal");
  const pending = mode === "pending";

  return (
    <article className="relative flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <TicketHeader ticket={ticket} thresholds={thresholds} mode={mode} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-body-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{ticketTitle(ticket)}</span>
        {pending && ticket.is_new && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.info)}>
            <Sparkles aria-hidden className="size-3.5" /> Nueva
          </span>
        )}
        {who && <span className="font-semibold text-foreground">{who}</span>}
        <span>Tomó: {author}</span>
        <span className="tabular-nums">Entró {clock(ticket.created_at)}</span>
      </div>

      <ul className="flex flex-1 flex-col divide-y divide-border px-4">
        {ticket.lines.map((l) => (
          <li key={l.id} className="flex gap-3 py-3">
            <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-control bg-foreground px-2 text-xl font-bold tabular-nums text-background">
              {l.quantity}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold leading-snug text-foreground">
                {l.product_name}
                {l.variant_name && <span className="font-medium text-muted-foreground"> · {l.variant_name}</span>}
              </p>
              {l.options.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Extras">
                  {l.options.map((o, i) => (
                    <li
                      key={`${o.group ?? ""}-${o.name ?? ""}-${i}`}
                      className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-body font-medium text-foreground"
                    >
                      {o.qty && o.qty > 1 ? `${o.qty} × ` : "+ "}
                      {o.name ?? o.group ?? ""}
                    </li>
                  ))}
                </ul>
              )}
              {l.notes && (
                <p className={cn("mt-2 flex items-start gap-2 rounded-control border px-2.5 py-1.5 text-lg font-semibold", toneSoft.attention)}>
                  <MessageSquareWarning aria-hidden className="mt-1 size-4 shrink-0" />
                  <span>
                    <span className="sr-only">Nota: </span>
                    {l.notes}
                  </span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {ticket.order_notes && (
        <div className={cn("mx-4 mb-3 flex items-start gap-2 rounded-control border px-3 py-2", toneSoft.attention)}>
          <MessageSquareWarning aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="text-lg font-semibold leading-snug">
            <span className="block text-caption font-semibold">Nota del pedido</span>
            {ticket.order_notes}
          </p>
        </div>
      )}

      <div className="border-t border-border bg-background p-3">
        <ActionButton
          action={() => action(ticket.ticket_id)}
          onSuccess={onDone}
          pendingText={pending ? "Marcando lista…" : "Devolviendo…"}
          variant={pending ? "default" : "outline"}
          className={cn(
            "w-full text-body-lg font-semibold",
            pending ? "min-h-14 bg-money-in text-money-in-foreground hover:bg-money-in/90" : "min-h-12"
          )}
        >
          {pending ? (
            <>
              <Check aria-hidden className="size-6" /> Comanda lista
            </>
          ) : (
            <>
              <RotateCcw aria-hidden className="size-5" /> Devolver a preparación
            </>
          )}
        </ActionButton>
      </div>
    </article>
  );
}
