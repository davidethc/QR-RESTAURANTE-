import Link from "next/link";
import { ArrowUpRight, ChevronDown, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
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
  /></div>;
  return <ol aria-label="Eventos de seguridad" className="flex flex-col gap-3">
    {groups.map((group) => {
      const first = group.events[0];
      const heading = SECURITY_ACTIONS[first.event_type as SecurityAction] ?? "Acción del equipo";
      return <li key={group.key} className="overflow-hidden rounded-card border border-border bg-card">
        <details className="group" open={groups.length === 1}>
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-secondary text-muted-foreground"><ShieldCheck className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-semibold text-foreground">{heading}</span>
              <span className="mt-1 block text-meta text-muted-foreground">{first.actor_user_id ? names.get(first.actor_user_id) ?? "Miembro no disponible" : "Acción del sistema"}</span>
              <time dateTime={group.createdAt} className="mt-1 block text-caption text-muted-foreground">{displayDate(group.createdAt)}</time>
            </span>
            <Badge variant="secondary">{group.events.length} {group.events.length === 1 ? "evento" : "eventos"}</Badge>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {group.events.map((event) => {
              const orderHref = securityEventOrderHref(event);
              return <li key={event.id} className="flex flex-col gap-3 p-4 sm:pl-16">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-body-sm font-medium text-foreground">{SECURITY_ACTIONS[event.event_type as SecurityAction] ?? "Acción del equipo"}</p>
                    <p className="mt-1 text-meta text-muted-foreground">{event.actor_user_id ? names.get(event.actor_user_id) ?? "Miembro no disponible" : "Acción del sistema"}</p>
                    <time dateTime={event.created_at} className="text-caption text-muted-foreground">{displayDate(event.created_at)}</time>
                  </div>
                  {event.amount !== null && <p className="text-body-sm font-semibold tabular-nums text-foreground">{formatPrice(event.amount)}</p>}
                </div>
                {event.reason && <p className="break-words text-body-sm text-muted-foreground">Motivo: {event.reason}</p>}
                {event.cash_movement_reason && <p className="text-body-sm text-muted-foreground">Motivo: {MOVEMENT_REASONS[event.cash_movement_reason] ?? "Movimiento de caja"}</p>}
                {event.cash_difference !== null && <p className="text-body-sm text-foreground">Diferencia de efectivo: {formatPrice(event.cash_difference)}</p>}
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
