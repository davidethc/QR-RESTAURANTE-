import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CashDifferenceSummary } from "./cash-difference-summary";
import { formatPrice } from "@/lib/utils";
import type { CashSessionSummary } from "@/types/billing";

/**
 * Historial de cierres (bug P1 de QA 2026-09-26: no había ninguna pantalla
 * para revisar esperado/contado/diferencia de una caja ya cerrada — solo se
 * podía ver con SQL directo). Solo OWNER/ADMIN: el gate está en page.tsx,
 * que ni siquiera pide los resúmenes si el rol es WAITER.
 */
export function ClosedSessionsHistory({
  sessions,
  timeZone,
}: {
  sessions: CashSessionSummary[];
  timeZone: string;
}) {
  if (sessions.length === 0) return null;

  const dateFormatter = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Cierres anteriores
      </p>
      <Accordion type="single" collapsible className="rounded-2xl border border-border/60 bg-card px-4">
        {sessions.map((session) => {
          const diff = session.difference_total ?? 0;
          const cuadra = diff === 0;
          return (
            <AccordionItem key={session.id} value={session.id}>
              <AccordionTrigger className="min-h-11 py-3">
                <div className="flex w-full flex-wrap items-center justify-between gap-2 pr-2">
                  <div className="text-left">
                    <p className="font-display text-[14px] font-medium text-foreground">
                      {session.register_name ?? "Caja"}
                      {session.closed_at && ` · ${dateFormatter.format(new Date(session.closed_at))}`}
                    </p>
                    {session.opening_float !== undefined && (
                      <p className="text-[12px] text-muted-foreground">
                        Fondo {formatPrice(session.opening_float)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={cuadra ? "secondary" : "destructive"}
                    className="font-display text-[12px] tabular-nums"
                  >
                    {cuadra ? "Cuadró" : `${diff > 0 ? "+" : ""}${formatPrice(diff)}`}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CashDifferenceSummary
                  differenceTotal={session.difference_total}
                  byMethod={session.by_method}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
