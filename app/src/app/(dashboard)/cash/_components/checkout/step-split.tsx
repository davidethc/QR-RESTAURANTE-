"use client";

import { ListChecks, Minus, Plus, Users, Wallet } from "lucide-react";
import { ChoiceCards } from "@/components/shared/choice-card";
import { PersonChips } from "@/components/shared/person-chips";
import { posPressable } from "@/components/shared/pos-tone";
import { cn, formatPrice } from "@/lib/utils";
import { SPLIT_MODE, type SplitMode } from "@/config/constants";
import type { SplitProgress } from "@/lib/split-progress";
import type { Bill } from "@/types/billing";
import { ChargeTicket } from "../charge-ticket";
import { StepFooter } from "./step-footer";

/**
 * Paso 2 · ¿Cómo pagan? Tres maneras con un dibujo y una línea que dice qué
 * pasa. Elegir aplica la división en la base al momento (set_bill_split),
 * así lo que se ve aquí es lo mismo que cobrará el siguiente paso.
 */
export function StepSplit({
  bill,
  progress,
  pending,
  selectedItems,
  remainingByItem,
  suggestedAmount,
  onToggleItem,
  onChangeSplit,
  onBack,
  onNext,
}: {
  bill: Bill;
  progress: SplitProgress | null;
  pending: boolean;
  selectedItems: Record<string, boolean>;
  remainingByItem: Record<string, number>;
  suggestedAmount: number;
  onToggleItem: (id: string, checked: boolean) => void;
  onChangeSplit: (mode: SplitMode, parts?: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const mode = bill.split_mode;
  const nothingPicked = mode === SPLIT_MODE.ITEMS && suggestedAmount <= 0;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
        <h3 className="mb-3 text-lead font-semibold text-foreground">¿Cómo van a pagar?</h3>
        <ChoiceCards<SplitMode>
          label="Cómo van a pagar"
          size="md"
          value={mode}
          onChange={(v) => onChangeSplit(v)}
          options={[
            {
              value: SPLIT_MODE.NONE,
              title: "Todo junto",
              description: "Una persona paga la cuenta completa.",
              icon: Wallet,
              tone: "money-in",
              meta: formatPrice(bill.balance),
            },
            {
              value: SPLIT_MODE.EQUAL,
              title: "Partes iguales",
              description: "Divides entre varias personas y cobras de a una.",
              icon: Users,
              tone: "info",
            },
            {
              value: SPLIT_MODE.ITEMS,
              title: "Por productos",
              description: "Cada persona paga lo que consumió.",
              icon: ListChecks,
              tone: "attention",
            },
          ]}
        />

        <div aria-busy={pending} className={cn("mt-5 transition-opacity duration-150", pending && "opacity-60")}>
          {mode === SPLIT_MODE.EQUAL && (
            <section aria-labelledby="split-parts" className="flex flex-col gap-4 rounded-card border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 id="split-parts" className="text-body font-semibold text-foreground">
                  ¿Entre cuántas personas?
                </h4>
                <div className="flex items-center gap-2">
                  <StepperButton
                    label="Una persona menos"
                    disabled={pending || bill.split_parts <= 2 || (progress?.paidCount ?? 0) > 0}
                    onClick={() => onChangeSplit(SPLIT_MODE.EQUAL, bill.split_parts - 1)}
                  >
                    <Minus className="size-5" aria-hidden />
                  </StepperButton>
                  <output aria-live="polite" className="w-12 text-center font-display text-title font-semibold tabular-nums">
                    {bill.split_parts}
                  </output>
                  <StepperButton
                    label="Una persona más"
                    disabled={pending || bill.split_parts >= 50 || (progress?.paidCount ?? 0) > 0}
                    onClick={() => onChangeSplit(SPLIT_MODE.EQUAL, bill.split_parts + 1)}
                  >
                    <Plus className="size-5" aria-hidden />
                  </StepperButton>
                </div>
              </div>
              {progress && <PersonChips persons={progress.persons} />}
              <p className="text-meta text-muted-foreground">
                {progress?.current
                  ? `Ahora se cobra a la persona ${progress.current}. Después de cobrar, el sistema pasa a la siguiente.`
                  : "Ya pagaron todos."}
                {(progress?.paidCount ?? 0) > 0 && " Ya hay pagos: el número de personas queda fijo."}
              </p>
            </section>
          )}

          {mode === SPLIT_MODE.ITEMS && (
            <section aria-labelledby="split-items" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h4 id="split-items" className="text-body font-semibold text-foreground">
                  Toca lo que paga esta persona
                </h4>
                <span className="text-body font-semibold tabular-nums text-foreground">{formatPrice(suggestedAmount)}</span>
              </div>
              <ChargeTicket
                bill={bill}
                remainingByItem={remainingByItem}
                selectedItems={selectedItems}
                onToggleItem={onToggleItem}
                selectable
              />
            </section>
          )}
        </div>
      </div>

      <StepFooter
        primaryArrow
        onBack={onBack}
        hint={nothingPicked ? "Marca al menos un producto." : null}
        disabled={pending || nothingPicked || suggestedAmount <= 0}
        pending={pending}
        primaryLabel={
          <>
            Continuar · <span className="tabular-nums">{formatPrice(suggestedAmount)}</span>
          </>
        }
        onPrimary={onNext}
      />
    </>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(posPressable, "flex size-12 items-center justify-center rounded-full border border-border bg-secondary text-foreground hover:bg-muted")}
    >
      {children}
    </button>
  );
}
