import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import type { CashMethodSummary } from "@/types/billing";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

/**
 * Esperado/contado/diferencia de un turno, por método y total. Se usa tanto
 * en la tarjeta de resultado tras cerrar caja como en "Cierres anteriores"
 * — mismo desglose, dos lugares. Solo OWNER/ADMIN llega a verlo (el llamador
 * decide eso); acá solo se formatea lo que ya venga en la respuesta.
 */
export function CashDifferenceSummary({
  differenceTotal,
  byMethod,
}: {
  differenceTotal?: number | null;
  byMethod?: CashMethodSummary[];
}) {
  const diff = differenceTotal ?? 0;
  const cuadra = diff === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">Diferencia total</span>
        <Badge variant={cuadra ? "secondary" : "destructive"} className="font-display text-[13px] tabular-nums">
          {cuadra ? "Cuadró exacto" : `${diff > 0 ? "+" : ""}${formatPrice(diff)}`}
        </Badge>
      </div>

      {byMethod && byMethod.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-secondary/40 p-3">
          {byMethod.map((m) => {
            const methodDiff = m.difference ?? null;
            const methodMismatch = methodDiff !== null && methodDiff !== 0;
            return (
              <div key={m.method} className="flex items-center justify-between text-[13px]">
                <span className="text-foreground">{METHOD_LABEL[m.method] ?? m.method}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-muted-foreground">
                    esperado {formatPrice(m.expected)} · contado{" "}
                    {m.counted === null ? "—" : formatPrice(m.counted)}
                  </span>
                  {methodDiff !== null && (
                    <span
                      className={
                        methodMismatch
                          ? "font-display font-semibold text-destructive"
                          : "font-display text-muted-foreground"
                      }
                    >
                      {methodDiff > 0 ? "+" : ""}
                      {formatPrice(methodDiff)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
