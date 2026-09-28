"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import type { Bill } from "@/types/billing";

export type ChargeTab = "account" | "pay" | "adjust";

const primaryClass = "clay clay-primary h-14 min-w-0 flex-1 rounded-full text-[16px] font-semibold lg:flex-none lg:px-8";

/**
 * Barra fija al pie de la hoja: el saldo siempre a la vista (en móvil) y
 * UNA sola acción primaria según el estado de la cuenta y la pestaña:
 *   - cuenta cerrable            → "Cerrar cuenta"
 *   - cuenta abierta, en Cobrar  → "Cobrar $X" (envía el PaymentForm vía `form`)
 *   - cuenta abierta, otra pestaña → "Cobrar" (lleva a la pestaña Cobrar)
 *   - pagada con pedidos en curso → sin acción, solo el aviso
 *
 * El saldo lleva `aria-live`: es el único anuncio del saldo en la hoja. En
 * escritorio el ticket ya lo muestra grande, así que aquí queda solo para
 * lectores de pantalla (`lg:sr-only`).
 */
export function ChargeFooter({
  bill,
  tab,
  formId,
  payAmount,
  paySubmitting,
  closePending,
  onGoToPay,
  onCloseBill,
}: {
  bill: Bill;
  tab: ChargeTab;
  formId: string;
  payAmount: number;
  paySubmitting: boolean;
  closePending: boolean;
  onGoToPay: () => void;
  onCloseBill: () => void;
}) {
  let action: React.ReactNode = null;
  if (bill.can_close) {
    action = (
      <Button type="button" disabled={closePending} onClick={onCloseBill} className={primaryClass}>
        {closePending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
        Cerrar cuenta
      </Button>
    );
  } else if (bill.status === "OPEN" && tab === "pay") {
    action = (
      <Button type="submit" form={formId} disabled={paySubmitting} className={primaryClass}>
        {paySubmitting && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
        Cobrar <span className="font-display tabular-nums">{formatPrice(payAmount)}</span>
      </Button>
    );
  } else if (bill.status === "OPEN") {
    action = (
      <Button type="button" onClick={onGoToPay} className={primaryClass}>
        Cobrar
      </Button>
    );
  } else if (bill.status === "PAID") {
    action = (
      <p className="flex-1 text-right text-[13px] text-muted-foreground lg:flex-none">
        Pagada · esperando pedidos en curso
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4 border-t border-border/70 bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:justify-end lg:px-6">
      <div className="flex min-w-0 flex-col lg:sr-only" aria-live="polite" aria-atomic="true">
        <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Saldo</span>
        <span className="font-display text-[26px] leading-none font-semibold tabular-nums text-wine">
          {formatPrice(bill.balance)}
        </span>
      </div>
      {action}
    </div>
  );
}
