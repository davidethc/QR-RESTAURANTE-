"use client";

import { Minus, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { SPLIT_MODE } from "@/config/constants";
import type { SplitMode } from "@/config/constants";
import type { Bill } from "@/types/billing";
import { DiscountDialog } from "./discount-dialog";

/**
 * Pestaña "Ajustes" de la hoja de cobro: dividir la cuenta, descuentos y
 * pagos ya registrados. Todo lo que cambia la cuenta se aplica al tocar
 * (no hay botón "guardar"), por eso esta pestaña no tiene acción en el pie.
 */
export function ChargeAdjustments({
  bill,
  partLabel,
  splitPending,
  removePending,
  onChangeSplit,
  onRemoveDiscount,
  onDiscountApplied,
}: {
  bill: Bill;
  partLabel: string | null;
  splitPending: boolean;
  removePending: boolean;
  onChangeSplit: (mode: SplitMode, parts?: number) => void;
  onRemoveDiscount: (discountId: string) => void;
  onDiscountApplied: (bill: Bill) => void;
}) {
  const isOpen = bill.status === "OPEN";
  const payments = bill.payments.filter((p) => p.status === "COMPLETED");

  return (
    <div className="flex flex-col gap-6">
      {isOpen && (
        <section aria-labelledby="adj-split" className="flex flex-col gap-2.5">
          <SectionTitle id="adj-split">Dividir cuenta</SectionTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            value={bill.split_mode}
            onValueChange={(v) => v && onChangeSplit(v as SplitMode)}
            className="grid w-full grid-cols-3 gap-2"
            disabled={splitPending}
          >
            <ToggleGroupItem value={SPLIT_MODE.NONE} className={toggleClass}>
              Completa
            </ToggleGroupItem>
            <ToggleGroupItem value={SPLIT_MODE.EQUAL} className={toggleClass}>
              Partes iguales
            </ToggleGroupItem>
            <ToggleGroupItem value={SPLIT_MODE.ITEMS} className={toggleClass}>
              Por ítems
            </ToggleGroupItem>
          </ToggleGroup>

          {bill.split_mode === SPLIT_MODE.EQUAL && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card p-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 shrink-0 rounded-full"
                disabled={splitPending || bill.split_parts <= 2}
                onClick={() => onChangeSplit(SPLIT_MODE.EQUAL, bill.split_parts - 1)}
                aria-label="Menos partes"
              >
                <Minus aria-hidden />
              </Button>
              <p className="text-center text-meta leading-tight text-muted-foreground" aria-live="polite">
                <span className="block font-display text-title font-semibold text-foreground">
                  {bill.split_parts} partes
                </span>
                {partLabel}
              </p>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 shrink-0 rounded-full"
                disabled={splitPending || bill.split_parts >= 50}
                onClick={() => onChangeSplit(SPLIT_MODE.EQUAL, bill.split_parts + 1)}
                aria-label="Más partes"
              >
                <Plus aria-hidden />
              </Button>
            </div>
          )}

          {bill.split_mode === SPLIT_MODE.ITEMS && (
            <p className="text-meta text-muted-foreground">
              Marca en el ticket qué ítems paga cada persona y cobra en la pestaña Cobrar.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="adj-discounts" className="flex flex-col gap-2.5">
        <SectionTitle id="adj-discounts">Descuentos</SectionTitle>
        {bill.discounts.length === 0 && (
          <p className="text-meta text-muted-foreground">Sin descuentos aplicados.</p>
        )}
        {bill.discounts.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {bill.discounts.map((d) => (
              <li
                key={d.id}
                className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-secondary/60 py-1 pr-1 pl-3 text-body-sm"
              >
                <span className="min-w-0 text-foreground">
                  {d.kind === "PERCENT" ? `${d.value}%` : formatPrice(d.value)}
                  <span className="text-muted-foreground"> · {d.reason}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="tabular-nums text-foreground">−{formatPrice(d.amount)}</span>
                  {bill.status !== "CLOSED" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={removePending}
                      className="size-11 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemoveDiscount(d.id)}
                      aria-label={`Quitar descuento: ${d.reason}`}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isOpen && (
          <DiscountDialog
            billId={bill.id}
            onApplied={onDiscountApplied}
            trigger={
              <Button variant="outline" className="h-12 w-full rounded-full text-body-sm font-semibold">
                <Tag data-icon="inline-start" aria-hidden /> Aplicar descuento
              </Button>
            }
          />
        )}
      </section>

      <section aria-labelledby="adj-payments" className="flex flex-col gap-2.5">
        <SectionTitle id="adj-payments">Pagos registrados</SectionTitle>
        {payments.length === 0 ? (
          <p className="text-meta text-muted-foreground">Todavía no se registró ningún pago.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 text-body-sm">
                <span className="text-foreground">
                  {PAYMENT_METHOD_LABEL[p.method]}
                  {p.tip_amount > 0 && (
                    <span className="text-muted-foreground"> · propina {formatPrice(p.tip_amount)}</span>
                  )}
                </span>
                <span className="font-display tabular-nums text-foreground">{formatPrice(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const toggleClass =
  "h-12 min-w-0 rounded-xl px-1 text-meta font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary";

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}
