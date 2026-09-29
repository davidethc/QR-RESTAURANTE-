"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Printer, Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";
import { openBill, setBillSplit, removeBillDiscount, closeBill } from "@/lib/actions/billing";
import { SPLIT_MODE } from "@/config/constants";
import type { SplitMode } from "@/config/constants";
import type { Bill, RecordPaymentResult } from "@/types/billing";
import { PaymentForm, type PaymentFormStatus } from "./payment-form";
import { ChargeTicket } from "./charge-ticket";
import { ChargeTotals } from "./charge-totals";
import { ChargeAdjustments } from "./charge-adjustments";
import { ChargeFooter, type ChargeTab } from "./charge-footer";
import { useChargeAmounts } from "./use-charge-amounts";
import { ChargeProductPicker } from "./charge-product-picker";

/** Una sola hoja en todo el panel (ver charge-sheet-host.tsx): el id es fijo. */
const PAYMENT_FORM_ID = "charge-payment-form";

const tabTriggerClass = "h-full rounded-lg text-body-sm font-semibold";

interface ChargeSheetProps {
  /** Sesión de mesa viva (ACTIVE o EXPIRED). openBill la crea o la reutiliza. */
  tableSessionId: string;
  tableLabel: string;
  /** Controlado desde `ChargeSheetProvider` (charge-sheet-host.tsx) — hay una
   * sola instancia de esta hoja para todo el panel, montada en el layout, así
   * ninguna lista (llamadas, mesas, cuentas abiertas) puede desmontarla a
   * mitad de cobro cuando el refresco en tiempo real las actualiza. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La cuenta quedó CLOSED (pagada y sin pedidos activos): la mesa se liberó sola. */
  onSettled?: () => void;
}

/**
 * Hoja de cobro (solo OWNER/ADMIN). Abre con `openBill(tableSessionId)` —
 * idempotente: si ya hay una cuenta viva para esa sesión la reutiliza, si
 * no la crea. Todo el cálculo de dinero vive en las RPCs (record_payment,
 * recompute_bill); esto solo pinta lo que devuelven y arma el siguiente pago.
 *
 * Es el orquestador: el estado (cuenta, clave de idempotencia, selección
 * por ítems, pestaña) vive aquí y los hijos solo pintan.
 * Layout: en `lg` dos columnas (pestañas Cobrar/Ajustes a la izquierda,
 * ticket + saldo fijo a la derecha); por debajo, tres pestañas (Cuenta,
 * Cobrar, Ajustes) y una barra inferior con el saldo y la acción.
 * Las pestañas usan `forceMount`: cambiar de pestaña no desmonta el
 * formulario de pago a medio llenar.
 */
export function ChargeSheet({ tableSessionId, tableLabel, open, onOpenChange, onSettled }: ChargeSheetProps) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<ChargeTab>("account");
  const [payStatus, setPayStatus] = useState<PaymentFormStatus>({ amount: 0, submitting: false });
  const [splitPending, startSplitTransition] = useTransition();
  const [closePending, startCloseTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();

  // En escritorio el ticket está siempre a la vista, así que la pestaña
  // "Cuenta" no existe: se muestra Cobrar en su lugar.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const activeTab: ChargeTab = isDesktop && tab === "account" ? "pay" : tab;

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    openBill(tableSessionId).then((result) => {
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setBill(result.data);
    });
  }, [tableSessionId]);

  // `open` lo controla `ChargeSheetProvider`, no un <SheetTrigger> local:
  // Radix no dispara `onOpenChange` cuando el padre abre la hoja por prop.
  // El reinicio de estado de UI se ajusta durante el render (patrón de
  // React para "reaccionar a un cambio de prop" sin efecto:
  // https://react.dev/learn/you-might-not-need-an-effect); la carga de red
  // —que sí es un efecto legítimo— vive en el useEffect de abajo.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelectedItems({});
      setIdempotencyKey(crypto.randomUUID());
      setTab("account");
    } else {
      setBill(null);
      setLoadError(null);
    }
  }

  useEffect(() => {
    // El efecto ES la sincronización con el sistema externo (la RPC
    // `openBill`) — `load` marca `loading` antes de la llamada de red,
    // igual que el patrón ya usado en `use-cart.ts`. El linter no
    // distingue eso de estado derivado calculable en el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tableSessionId]);

  function goToPay() {
    setTab("pay");
    // Foco en la forma de pago elegida (no en el monto: en un celular eso
    // abriría el teclado encima del saldo).
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`#${PAYMENT_FORM_ID} [data-state="on"]`)?.focus();
    });
  }

  function handlePaid(result: RecordPaymentResult) {
    setBill(result.bill);
    setSelectedItems({});
    setIdempotencyKey(crypto.randomUUID());
    if (result.replayed) {
      notify.success("Ese pago ya se había registrado.");
      return;
    }
    notify.success(
      result.change_amount ? `Cobrado · vuelto ${formatPrice(result.change_amount)}` : "Pago registrado"
    );
  }

  function changeSplitMode(mode: SplitMode, parts?: number) {
    if (!bill) return;
    startSplitTransition(async () => {
      const result = await setBillSplit({
        billId: bill.id,
        mode,
        parts: parts ?? (mode === SPLIT_MODE.EQUAL ? Math.max(2, bill.split_parts || 2) : 1),
      });
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setBill(result.data);
      setSelectedItems({});
    });
  }

  function handleRemoveDiscount(discountId: string) {
    startRemoveTransition(async () => {
      const result = await removeBillDiscount({ discountId });
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setBill(result.data);
      notify.success("Descuento retirado");
    });
  }

  function handleCloseBill() {
    if (!bill) return;
    startCloseTransition(async () => {
      const result = await closeBill(bill.id);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setBill(result.data);
      notify.success("Cuenta cerrada");
    });
  }

  const { remainingByItem, paymentItems, suggestedAmount, currentPartLabel } = useChargeAmounts(
    bill,
    selectedItems
  );

  const resetToken = bill
    ? `${bill.split_mode}-${bill.split_parts}-${bill.balance}-${JSON.stringify(paymentItems)}`
    : "";

  const settled = bill?.status === "CLOSED";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md",
          bill && !settled && "data-[side=right]:lg:max-w-[min(1120px,96vw)]"
        )}
      >
        <SheetHeader className="flex-row items-center gap-3 border-b border-border bg-card py-3 pr-16 pl-4 lg:pl-6">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="truncate text-title-sm font-semibold">Cobrar · {tableLabel}</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              {bill ? `Cuenta #${bill.bill_number}` : "Cargando la cuenta…"}
              {bill?.status === "OPEN" && <Badge variant="secondary">Abierta</Badge>}
              {bill?.status === "PAID" && <Badge variant="outline">Pagada</Badge>}
            </SheetDescription>
          </div>
          {bill && !settled && (
            <Button asChild variant="outline" className="h-11 min-w-11 shrink-0 px-3 text-body-sm font-semibold sm:px-4">
              <Link
                href={`/cash/ticket/${bill.id}?print=1`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Imprimir pre-cuenta"
              >
                <Receipt aria-hidden data-icon="inline-start" />
                <span className="max-sm:sr-only">Pre-cuenta</span>
              </Link>
            </Button>
          )}
        </SheetHeader>

        {loading && !bill && (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-3 p-4">
            <p role="alert" className="rounded-control border border-destructive/30 bg-destructive-soft p-3 text-body-sm text-destructive">
              {loadError}
            </p>
            <Button variant="outline" className="h-12 w-full" onClick={load}>
              Reintentar
            </Button>
          </div>
        )}

        {bill && settled && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-16 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
              <CheckCircle2 className="size-9" aria-hidden />
            </span>
            <p className="text-title font-semibold text-foreground">Mesa cobrada ✓</p>
            <p className="text-body-sm text-muted-foreground">{tableLabel} quedó libre para el próximo cliente.</p>
            <Button asChild variant="outline" className="mt-4 h-12 w-full text-body font-semibold">
              <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
                <Printer aria-hidden data-icon="inline-start" /> Imprimir ticket
              </Link>
            </Button>
            <Button
              className="h-12 w-full text-body font-semibold"
              onClick={() => onSettled?.()}
            >
              Listo
            </Button>
          </div>
        )}

        {bill && !settled && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setTab(v as ChargeTab)}
            className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 lg:grid-cols-[minmax(0,1fr)_400px]"
          >
            <div className="border-b border-border px-4 py-2 lg:col-start-1 lg:row-start-1 lg:px-6 lg:pt-4 lg:pb-3">
              <TabsList className="w-full group-data-horizontal/tabs:h-[3.25rem] lg:w-fit" aria-label="Secciones del cobro">
                <TabsTrigger value="account" className={cn(tabTriggerClass, "lg:hidden")}>
                  Cuenta
                </TabsTrigger>
                <TabsTrigger value="pay" className={cn(tabTriggerClass, "lg:px-6")}>
                  Cobrar
                </TabsTrigger>
                <TabsTrigger value="adjust" className={cn(tabTriggerClass, "lg:px-6")}>
                  Ajustes
                </TabsTrigger>
              </TabsList>
            </div>

            <div
              className={cn(
                "min-h-0 overflow-y-auto overscroll-contain lg:col-start-1 lg:row-start-2",
                activeTab === "account" && "max-lg:hidden"
              )}
            >
              <TabsContent value="pay" forceMount className="p-4 data-[state=inactive]:hidden lg:p-6">
                {bill.status === "OPEN" ? (
                  <div className="flex flex-col gap-4">
                    {bill.split_mode === SPLIT_MODE.ITEMS && !paymentItems && (
                      <p className="rounded-control bg-warning-soft px-3 py-2.5 text-body-sm text-warning-soft-foreground">
                        Marca en el ticket{isDesktop ? "" : " (pestaña Cuenta)"} qué ítems paga esta persona.
                      </p>
                    )}
                    {currentPartLabel && (
                      <p className="text-body-sm font-medium text-muted-foreground">{currentPartLabel}</p>
                    )}
                    <PaymentForm
                      formId={PAYMENT_FORM_ID}
                      bill={bill}
                      suggestedAmount={suggestedAmount}
                      resetToken={resetToken}
                      paymentItems={paymentItems}
                      idempotencyKey={idempotencyKey}
                      onPaid={handlePaid}
                      onStatusChange={setPayStatus}
                    />
                  </div>
                ) : (
                  <p className="rounded-control bg-warning-soft px-3 py-2.5 text-body-sm text-warning-soft-foreground">
                    {bill.can_close
                      ? "La cuenta está pagada. Ciérrala para liberar la mesa."
                      : "Ya está pagada. Falta que salgan los pedidos en curso para poder cerrar la mesa."}
                  </p>
                )}
              </TabsContent>
              <TabsContent value="adjust" forceMount className="p-4 data-[state=inactive]:hidden lg:p-6">
                <ChargeAdjustments
                  bill={bill}
                  partLabel={currentPartLabel}
                  splitPending={splitPending}
                  removePending={removePending}
                  onChangeSplit={changeSplitMode}
                  onRemoveDiscount={handleRemoveDiscount}
                  onDiscountApplied={setBill}
                />
              </TabsContent>
            </div>

            <TabsContent
              value="account"
              forceMount
              className={cn(
                "flex min-h-0 flex-col bg-secondary lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:border-l lg:border-border",
                activeTab !== "account" && "max-lg:hidden"
              )}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">
                <h3 className="mb-3 hidden text-lead font-semibold text-foreground lg:block">Consumo</h3>
                {bill.status === "PAID" && !bill.can_close && (
                  <p className="mb-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning-soft-foreground lg:hidden">
                    Ya está pagada. Falta que salgan los pedidos en curso para poder cerrar la mesa.
                  </p>
                )}
                <ChargeTicket
                  bill={bill}
                  remainingByItem={remainingByItem}
                  selectedItems={selectedItems}
                  onToggleItem={(id, checked) => setSelectedItems((prev) => ({ ...prev, [id]: checked }))}
                />
                {(bill.status === "OPEN" || bill.status === "PAID") && (
                  <div className="mt-3">
                    <ChargeProductPicker
                      billId={bill.id}
                      onAdded={(next) => {
                        setBill(next);
                        setSelectedItems({});
                        setIdempotencyKey(crypto.randomUUID());
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="border-t border-border bg-card px-4 py-3 lg:px-6 lg:py-4">
                <ChargeTotals bill={bill} partLabel={currentPartLabel} />
              </div>
            </TabsContent>

            <div className="lg:col-start-1 lg:row-start-3">
              <ChargeFooter
                bill={bill}
                tab={activeTab}
                formId={PAYMENT_FORM_ID}
                payAmount={payStatus.amount}
                paySubmitting={payStatus.submitting}
                closePending={closePending}
                onGoToPay={goToPay}
                onCloseBill={handleCloseBill}
              />
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
