import Link from "next/link";
import { ArrowUpRight, ChevronDown, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { toneBar, toneSoft, toneText, type PosTone } from "@/components/shared/pos-tone";
import { cn, formatPrice } from "@/lib/utils";
import { securityEventStyle } from "./security-event-style";
import { SECURITY_ACTIONS, securityEventOrderHref, type SecurityAction, type SecurityGroup } from "@/lib/security-history";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
const MOVEMENT_REASONS: Record<string, string> = { FLOAT_TOPUP: "Reposición de fondo", TIPS_PAYOUT: "Pago de propinas", SUPPLIER_PAYMENT: "Pago a proveedor", EXPENSE: "Gasto", REFUND: "Devolución", WITHDRAWAL: "Retiro", OTHER: "Otro motivo" };

export function SecurityList({ groups, members, filtered }: {
  groups: SecurityGroup[];
  members: { id: string; name: string }[];
  filtered: boolean;
}) {
  const names = new Map(members.map((member) => [member.id, member.name]));
  if (!groups.length) return <div className="rounded-card border border-border bg-card"><EmptyState
    icon={ShieldCheck}
    title={filtered ? "No hay eventos con estos filtros" : "Todavía no hay eventos de seguridad"}
    description={filtered ? "Prueba con otras fechas o con todo el equipo. En cuanto haya una acción sensible, aparecerá aquí." : "En cuanto haya una acción sensible, aparecerá aquí para que puedas revisarla."}
    action={filtered ? <Button asChild variant="outline" className="min-h-11"><Link href="/security">Quitar filtros</Link></Button> : <Button asChild variant="outline" className="min-h-11"><Link href="/today">Ir a Hoy</Link></Button>}
  /></div>;
  return <ol aria-label="Eventos de seguridad" className="flex flex-col gap-3">
    {groups.map((group) => {
      const first = group.events[0];
      const heading = SECURITY_ACTIONS[first.event_type as SecurityAction] ?? "Acción del equipo";
      const style = securityEventStyle(first.event_type);
      return <li key={group.key} className="relative overflow-hidden rounded-card border border-border bg-card">
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", toneBar[style.tone])} />
        <details className="group" open={groups.length === 1}>
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 py-3 pl-5 pr-4 transition-colors duration-150 hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
            <EventIcon tone={style.tone} icon={style.icon} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <TypeChip tone={style.tone} label={heading} />
                {group.events.length > 1 && <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-caption font-semibold text-muted-foreground">{group.events.length} eventos</span>}
              </span>
              <span className="mt-1.5 block truncate text-body-sm font-medium text-foreground">{first.actor_user_id ? names.get(first.actor_user_id) ?? "Miembro no disponible" : "Acción del sistema"}</span>
              <time dateTime={group.createdAt} className="block text-caption text-muted-foreground">{displayDate(group.createdAt)}</time>
            </span>
            {first.amount !== null && <span className="shrink-0 text-body font-semibold tabular-nums text-foreground">{formatPrice(first.amount)}</span>}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {group.events.map((event) => {
              const orderHref = securityEventOrderHref(event);
              const eventStyle = securityEventStyle(event.event_type);
              const EventGlyph = eventStyle.icon;
              return <li key={event.id} className="flex flex-col gap-3 bg-background/60 py-3 pl-5 pr-4 sm:pl-[4.75rem]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-body-sm font-medium text-foreground"><EventGlyph className={cn("size-4", eventStyle.tone === "neutral" ? "text-muted-foreground" : toneText[eventStyle.tone])} aria-hidden />{SECURITY_ACTIONS[event.event_type as SecurityAction] ?? "Acción del equipo"}</p>
                    <p className="mt-1 text-meta text-muted-foreground">{event.actor_user_id ? names.get(event.actor_user_id) ?? "Miembro no disponible" : "Acción del sistema"}</p>
                    <time dateTime={event.created_at} className="text-caption text-muted-foreground">{displayDate(event.created_at)}</time>
                  </div>
                  {event.amount !== null && <p className="text-body-sm font-semibold tabular-nums text-foreground">{formatPrice(event.amount)}</p>}
                </div>
                {event.reason && <p className="break-words text-body-sm text-muted-foreground">Motivo: {event.reason}</p>}
                {event.cash_movement_reason && <p className="text-body-sm text-muted-foreground">Motivo: {MOVEMENT_REASONS[event.cash_movement_reason] ?? "Movimiento de caja"}</p>}
                {event.cash_difference !== null && <p className={cn("w-fit rounded-control border px-2.5 py-1 text-body-sm font-medium", toneSoft[event.cash_difference === 0 ? "money-in" : "attention"])}>Diferencia de efectivo: {formatPrice(event.cash_difference)}</p>}
                {orderHref && <Button asChild variant="outline" className="min-h-11 w-fit"><Link href={orderHref}>Ver pedido <ArrowUpRight aria-hidden /></Link></Button>}
                {event.entity_type === "BILL" && event.entity_id && <Button asChild variant="outline" className="min-h-11 w-fit"><Link href={`/cash/ticket/${event.entity_id}`}>Ver cuenta <ArrowUpRight aria-hidden /></Link></Button>}
              </li>;
            })}
          </ul>
        </details>
      </li>;
    })}
  </ol>;
}

function EventIcon({ tone, icon: Icon }: { tone: PosTone; icon: React.ComponentType<{ className?: string }> }) {
  return <span className={cn("grid size-11 shrink-0 place-items-center rounded-full border", toneSoft[tone])}><Icon className="size-5" aria-hidden /></span>;
}

function TypeChip({ tone, label }: { tone: PosTone; label: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption font-semibold", toneSoft[tone])}>{label}</span>;
}
