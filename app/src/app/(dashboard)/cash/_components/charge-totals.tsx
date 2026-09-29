import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";
import type { Bill } from "@/types/billing";

/**
 * Bloque de totales al pie del ticket. El saldo es el número más grande de
 * la hoja (text-2xl). No lleva `aria-live`: el anuncio del
 * saldo vive en la barra inferior (ChargeFooter), que está siempre montada,
 * para no leerlo dos veces.
 */
export function ChargeTotals({ bill, partLabel }: { bill: Bill; partLabel: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 text-body-sm">
      <dl className="flex flex-col gap-1.5">
        <Row label="Subtotal" value={formatPrice(bill.subtotal)} />
        {bill.discount_total > 0 && (
          <Row label="Descuento" value={`−${formatPrice(bill.discount_total)}`} />
        )}
        {bill.paid_total > 0 && (
          <>
            <Row label="Total" value={formatPrice(bill.total)} />
            <Row label="Pagado" value={`−${formatPrice(bill.paid_total)}`} />
          </>
        )}
      </dl>
      {/* En móvil el saldo ya está en la barra inferior, justo debajo. */}
      <Separator className="my-1.5 max-lg:hidden" />
      <dl className="max-lg:hidden flex items-baseline justify-between gap-3">
        <dt className="text-meta font-semibold tracking-wide text-muted-foreground uppercase">Saldo</dt>
        <dd className="text-2xl leading-none font-semibold tabular-nums text-foreground">
          {formatPrice(bill.balance)}
        </dd>
      </dl>
      {partLabel && (
        <p className="text-right text-meta font-medium text-muted-foreground">{partLabel}</p>
      )}
      {bill.tip_total > 0 && (
        <p className="text-right text-meta text-muted-foreground">
          Propinas aparte: {formatPrice(bill.tip_total)}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
