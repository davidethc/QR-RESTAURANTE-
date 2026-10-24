import { Clock, PauseCircle } from "lucide-react";
import type { DigitalMenuState } from "@/types/digital-menu";

/** "hoy a las 18:00" / "el sábado a las 09:00", in the restaurant's time zone. */
export function formatMoment(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const tz = timeZone ?? "America/Guayaquil";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat("es-EC", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const now = new Date();
  if (day(date) === day(now)) return `hoy a las ${time}`;
  if (day(date) === day(new Date(now.getTime() + 86_400_000))) return `mañana a las ${time}`;
  const weekday = new Intl.DateTimeFormat("es-EC", { timeZone: tz, weekday: "long", day: "numeric", month: "short" }).format(date);
  return `el ${weekday} a las ${time}`;
}

/** Paused / closed notice: the customer can browse but not order. */
export function MenuStateNotice({ state, timeZone }: { state: DigitalMenuState; timeZone?: string }) {
  const paused = state.reason === "paused";
  const Icon = paused ? PauseCircle : Clock;
  const title = paused ? "Pedidos en línea en pausa" : "Estamos fuera de horario";
  const detail = paused
    ? state.paused_until
      ? `Volvemos a recibir pedidos ${formatMoment(state.paused_until, timeZone)}.`
      : "Volvemos a recibir pedidos muy pronto."
    : state.next_open_at
      ? `Abrimos ${formatMoment(state.next_open_at, timeZone)}.`
      : "Vuelve más tarde.";

  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-attention-border bg-attention-soft px-4 py-3">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-attention-soft-foreground" />
      <p className="text-body-sm leading-snug text-foreground">
        <span className="font-semibold">{title}.</span> {detail}{" "}
        <span className="text-muted-foreground">Mientras tanto puedes ver el menú.</span>
      </p>
    </div>
  );
}
