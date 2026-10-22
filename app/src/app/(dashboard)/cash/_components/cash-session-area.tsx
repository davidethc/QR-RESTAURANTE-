import { OpenCashCard } from "./open-cash-card";
import { CashSessionPanel } from "./cash-session-panel";
import type { CashSessionSummary, RegisterCashStatus } from "@/types/billing";

/**
 * Cajas del usuario: las abiertas muestran su turno y el corte; las cerradas
 * se abren desde una sola tarjeta que sugiere el último fondo registrado.
 */
export function CashSessionArea({
  summaries,
  registers,
  timeZone,
}: {
  summaries: CashSessionSummary[];
  registers: RegisterCashStatus[];
  timeZone: string;
}) {
  const closed = registers.filter((r) => !r.open_session_id);
  return (
    <div className="flex flex-col gap-4">
      {summaries.map((s) => (
        <CashSessionPanel key={s.id} summary={s} timeZone={timeZone} />
      ))}
      {closed.length > 0 && (
        <OpenCashCard
          registers={closed.map((r) => ({ id: r.register_id, name: r.register_name }))}
          suggestedFloats={Object.fromEntries(
            closed.filter((r) => r.cash_float_left !== null).map((r) => [r.register_id, r.cash_float_left as number])
          )}
        />
      )}
      {registers.length === 0 && (
        <p className="text-meta text-muted-foreground">
          No tienes cajas asignadas. Pídele a un administrador que te asigne una.
        </p>
      )}
    </div>
  );
}
