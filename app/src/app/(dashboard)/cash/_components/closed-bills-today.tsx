import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { ClosedBillToday } from "@/lib/queries/cash";

/**
 * Cuentas ya cobradas hoy (día comercial), con reimpresión a un toque.
 * Solo OWNER/ADMIN: el gate está en page.tsx, que ni siquiera pide esta
 * consulta si el rol es WAITER. "Reimprimir" abre el mismo ticket que
 * "Imprimir ticket" en la hoja de cobro — misma ruta, misma plantilla.
 */
export function ClosedBillsToday({
  bills,
  timeZone,
}: {
  bills: ClosedBillToday[];
  timeZone: string;
}) {
  const timeFormatter = new Intl.DateTimeFormat("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body font-semibold text-foreground">Cobradas hoy</p>
      {bills.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-2">
          <EmptyState
            title="Todavía no se cobra ninguna cuenta hoy"
            description="Las cuentas cerradas del día comercial van a aparecer aquí, con opción de reimprimir el ticket."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-foreground">
                  Cuenta #{bill.bill_number} · {bill.place_label}
                </p>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {timeFormatter.format(new Date(bill.closed_at))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className="text-lead font-semibold tabular-nums text-foreground">{formatPrice(bill.total)}</p>
                <Button asChild variant="outline" size="icon-lg" className="h-11 w-11">
                  <Link
                    href={`/cash/ticket/${bill.id}?print=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Reimprimir ticket de la cuenta ${bill.bill_number}`}
                  >
                    <Printer aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
