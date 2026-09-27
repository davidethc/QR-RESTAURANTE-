"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Minus, Plus, Printer, Receipt, Tag, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import { splitEqually } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import {
  openBill,
  setBillSplit,
  removeBillDiscount,
  closeBill,
} from "@/lib/actions/billing";
import { SPLIT_MODE } from "@/config/constants";
import type { SplitMode, UserRole } from "@/config/constants";
import type { Bill, RecordPaymentResult } from "@/types/billing";
import { PaymentForm } from "./payment-form";
import { DiscountDialog } from "./discount-dialog";

interface ChargeSheetProps {
  /** Sesión de mesa viva (ACTIVE o EXPIRED). openBill la crea o la reutiliza. */
  tableSessionId: string;
  tableLabel: string;
  role: UserRole;
  /** Tope de descuento del mesero (0 = no puede descontar). Ignorado para OWNER/ADMIN. */
  maxWaiterDiscountPct: number;
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
 * Hoja de cobro. Abre con `openBill(tableSessionId)` — idempotente: si ya
 * hay una cuenta viva para esa sesión la reutiliza, si no la crea. Todo el
 * cálculo de dinero vive en las RPCs (record_payment, recompute_bill); esto
 * solo pinta lo que devuelven y arma el siguiente pago.
 */
export function ChargeSheet({
  tableSessionId,
  tableLabel,
  role,
  maxWaiterDiscountPct,
  open,
  onOpenChange,
  onSettled,
}: ChargeSheetProps) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [splitPending, startSplitTransition] = useTransition();
  const [closePending, startCloseTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();

  const isAdmin = role === "OWNER" || role === "ADMIN";
  const canDiscount = isAdmin || maxWaiterDiscountPct > 0;

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

  // `open` ahora lo controla `ChargeSheetProvider` (el host único del panel),
  // no un <SheetTrigger> local — Radix ya no dispara `onOpenChange` cuando el
  // padre abre la hoja por prop. El reinicio de estado de UI se ajusta acá,
  // durante el render (patrón de React para "reaccionar a un cambio de
  // prop" sin efecto: https://react.dev/learn/you-might-not-need-an-effect),
  // y la carga de red —que sí es un efecto legítimo— vive en el useEffect
  // de abajo.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelectedItems({});
      setIdempotencyKey(crypto.randomUUID());
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

  // Cantidad restante por pagar de cada ítem (quantity - lo ya cobrado).
  const remainingByItem = useMemo(() => {
    const map: Record<string, number> = {};
    if (!bill) return map;
    for (const order of bill.orders) {
      if (!order.billable) continue;
      for (const item of order.items) {
        map[item.id] = item.quantity - (bill.items_paid_qty[item.id] ?? 0);
      }
    }
    return map;
  }, [bill]);

  const paymentItems = useMemo(() => {
    if (!bill || bill.split_mode !== SPLIT_MODE.ITEMS) return undefined;
    const list: { order_item_id: string; quantity: number }[] = [];
    for (const order of bill.orders) {
      for (const item of order.items) {
        const remaining = remainingByItem[item.id] ?? 0;
        if (selectedItems[item.id] && remaining > 0) {
          list.push({ order_item_id: item.id, quantity: remaining });
        }
      }
    }
    return list.length > 0 ? list : undefined;
  }, [bill, selectedItems, remainingByItem]);

  const itemsTotal = useMemo(() => {
    if (!bill || !paymentItems) return 0;
    let sum = 0;
    for (const order of bill.orders) {
      for (const item of order.items) {
        const sel = paymentItems.find((p) => p.order_item_id === item.id);
        if (sel) sum += sel.quantity * item.unit_price;
      }
    }
    return Math.min(Math.round(sum * 100) / 100, bill.balance);
  }, [bill, paymentItems]);

  const suggestedAmount = useMemo(() => {
    if (!bill) return 0;
    if (bill.split_mode === SPLIT_MODE.ITEMS) return itemsTotal;
    if (bill.split_mode === SPLIT_MODE.EQUAL) return bill.next_equal_share ?? bill.balance;
    return bill.balance;
  }, [bill, itemsTotal]);

  // Qué parte le toca cobrar ahora, para "Parte 2 de 3 · $3,33": cuenta
  // cuántas partes completas ya cubre lo pagado.
  const currentPartLabel = useMemo(() => {
    if (!bill || bill.split_mode !== SPLIT_MODE.EQUAL) return null;
    let shares: number[] = [];
    try {
      shares = splitEqually(bill.total, bill.split_parts);
    } catch {
      return null;
    }
    let paidCents = Math.round(bill.paid_total * 100);
    let idx = 0;
    for (const share of shares) {
      const shareCents = Math.round(share * 100);
      if (paidCents >= shareCents) {
        paidCents -= shareCents;
        idx++;
      } else break;
    }
    const current = Math.min(idx + 1, bill.split_parts);
    return `Parte ${current} de ${bill.split_parts} · ${formatPrice(bill.next_equal_share ?? shares[current - 1] ?? 0)}`;
  }, [bill]);

  const resetToken = bill
    ? `${bill.split_mode}-${bill.split_parts}-${bill.balance}-${JSON.stringify(paymentItems)}`
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 bg-card/60 p-4">
          <SheetTitle className="font-display text-[18px]">Cobrar · {tableLabel}</SheetTitle>
          <SheetDescription>
            {bill ? `Cuenta #${bill.bill_number}` : "Cargando la cuenta…"}
          </SheetDescription>
        </SheetHeader>

        {loading && !bill && (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
          </div>
        )}

        {loadError && (
          <div className="p-4">
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[14px] text-destructive">
              {loadError}
            </p>
            <Button variant="outline" className="mt-3 h-11 w-full rounded-full" onClick={load}>
              Reintentar
            </Button>
          </div>
        )}

        {bill && bill.status === "CLOSED" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <p className="font-display text-[20px] font-semibold text-foreground">Mesa cobrada ✓</p>
            <p className="text-[14px] text-muted-foreground">
              {tableLabel} quedó libre para el próximo cliente.
            </p>
            <Button asChild variant="outline" className="mt-4 h-12 w-full rounded-full text-[15px] font-semibold">
              <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
                <Printer aria-hidden data-icon="inline-start" /> Imprimir ticket
              </Link>
            </Button>
            <Button
              className="clay clay-primary h-12 w-full rounded-full text-[15px] font-semibold"
              onClick={() => {
                onSettled?.();
              }}
            >
              Listo
            </Button>
          </div>
        )}

        {bill && bill.status !== "CLOSED" && (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-3">
              {bill.orders
                .filter((o) => o.billable)
                .map((order) => (
                  <div key={order.id} className="flex flex-col gap-1.5">
                    {bill.orders.filter((o) => o.billable).length > 1 && (
                      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Pedido #{order.order_number}</span>
                        <span className="tabular-nums">{formatPrice(order.total)}</span>
                      </div>
                    )}
                    {order.items.map((item) => {
                      const remaining = remainingByItem[item.id] ?? item.quantity;
                      const showCheckbox = bill.split_mode === SPLIT_MODE.ITEMS && remaining > 0;
                      const itemLine = (
                        <span className="flex flex-1 justify-between gap-3 text-[14px] leading-snug text-foreground">
                          <span>
                            <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.product_name}
                            {remaining > 0 && remaining < item.quantity && (
                              <span className="text-muted-foreground"> · quedan {remaining}</span>
                            )}
                            {remaining <= 0 && <span className="text-success"> · pagado</span>}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatPrice(item.subtotal)}
                          </span>
                        </span>
                      );
                      // Con checkbox, toda la fila es el blanco táctil (mínimo
                      // 44px de alto) — un cuadrito de 20px sería casi
                      // imposible de acertar con prisa en una tablet.
                      return showCheckbox ? (
                        <label
                          key={item.id}
                          htmlFor={`bill-item-${item.id}`}
                          className="-mx-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 py-1 active:bg-secondary/60"
                        >
                          <Checkbox
                            id={`bill-item-${item.id}`}
                            className="h-5 w-5 shrink-0"
                            checked={!!selectedItems[item.id]}
                            onCheckedChange={(checked) =>
                              setSelectedItems((prev) => ({ ...prev, [item.id]: checked === true }))
                            }
                          />
                          {itemLine}
                        </label>
                      ) : (
                        <div key={item.id} className="flex items-center gap-2">
                          {itemLine}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>

            <Button asChild variant="outline" className="h-11 w-full rounded-full text-[14px] font-semibold">
              <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
                <Receipt aria-hidden data-icon="inline-start" /> Pre-cuenta
              </Link>
            </Button>

            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-3 text-[14px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatPrice(bill.subtotal)}</span>
              </div>
              {bill.discount_total > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento</span>
                  <span className="tabular-nums">-{formatPrice(bill.discount_total)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-foreground">
                <span>Total</span>
                <span className="font-display tabular-nums text-wine">{formatPrice(bill.total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Pagado</span>
                <span className="tabular-nums">{formatPrice(bill.paid_total)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between text-[16px] font-semibold text-foreground">
                <span>Saldo</span>
                <span className="font-display tabular-nums text-wine">{formatPrice(bill.balance)}</span>
              </div>
            </div>

            {bill.discounts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {bill.discounts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-[13px]">
                    <span className="text-foreground">
                      {d.kind === "PERCENT" ? `${d.value}%` : formatPrice(d.value)} · {d.reason}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">-{formatPrice(d.amount)}</span>
                      {isAdmin && (
                        <button
                          type="button"
                          disabled={removePending}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemoveDiscount(d.id)}
                          aria-label="Quitar descuento"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bill.payments.filter((p) => p.status === "COMPLETED").length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Pagos registrados
                </p>
                {bill.payments
                  .filter((p) => p.status === "COMPLETED")
                  .map((p) => (
                    <div key={p.id} className="flex justify-between rounded-xl bg-secondary/40 px-3 py-2 text-[13px]">
                      <span className="text-foreground">
                        {PAYMENT_METHOD_LABEL[p.method]}
                        {p.tip_amount > 0 && (
                          <span className="text-muted-foreground"> · propina {formatPrice(p.tip_amount)}</span>
                        )}
                      </span>
                      <span className="tabular-nums text-foreground">{formatPrice(p.amount)}</span>
                    </div>
                  ))}
              </div>
            )}

            {bill.status === "PAID" && !bill.can_close && (
              <p className="rounded-xl bg-honey-soft px-3 py-2 text-[13px] text-honey-soft-foreground">
                Ya está pagada. Falta que salgan los pedidos en curso para poder cerrar la mesa.
              </p>
            )}

            {bill.status === "OPEN" && (
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Dividir cuenta
                  </p>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={bill.split_mode}
                    onValueChange={(v) => v && changeSplitMode(v as SplitMode)}
                    className="grid w-full grid-cols-3 gap-2"
                    disabled={splitPending}
                  >
                    <ToggleGroupItem value={SPLIT_MODE.NONE} className="h-11 min-w-0 rounded-xl text-[13px] font-semibold">
                      Completa
                    </ToggleGroupItem>
                    <ToggleGroupItem value={SPLIT_MODE.EQUAL} className="h-11 min-w-0 rounded-xl text-[13px] font-semibold">
                      Partes iguales
                    </ToggleGroupItem>
                    <ToggleGroupItem value={SPLIT_MODE.ITEMS} className="h-11 min-w-0 rounded-xl text-[13px] font-semibold">
                      Por ítems
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {bill.split_mode === SPLIT_MODE.EQUAL && (
                    <div className="flex items-center justify-between rounded-xl border border-border/60 p-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-full"
                        disabled={splitPending || bill.split_parts <= 2}
                        onClick={() => changeSplitMode(SPLIT_MODE.EQUAL, bill.split_parts - 1)}
                        aria-label="Menos partes"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <p className="text-center text-[13px] leading-tight text-muted-foreground">
                        <span className="font-display block text-[18px] font-semibold text-foreground">
                          {bill.split_parts} partes
                        </span>
                        {currentPartLabel}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-full"
                        disabled={splitPending || bill.split_parts >= 50}
                        onClick={() => changeSplitMode(SPLIT_MODE.EQUAL, bill.split_parts + 1)}
                        aria-label="Más partes"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {bill.split_mode === SPLIT_MODE.ITEMS && !paymentItems && (
                    <p className="text-[13px] text-muted-foreground">
                      Marca arriba los ítems que va a pagar esta persona.
                    </p>
                  )}
                </div>

                {canDiscount && (
                  <DiscountDialog
                    billId={bill.id}
                    onApplied={(next) => setBill(next)}
                    trigger={
                      <Button variant="outline" className="h-11 w-full rounded-full text-[14px] font-semibold">
                        <Tag className="h-4 w-4" /> Aplicar descuento
                      </Button>
                    }
                  />
                )}

                <Separator />

                <PaymentForm
                  bill={bill}
                  suggestedAmount={suggestedAmount}
                  resetToken={resetToken}
                  paymentItems={paymentItems}
                  idempotencyKey={idempotencyKey}
                  onPaid={handlePaid}
                />
              </>
            )}

            {bill.can_close && (
              <Button
                disabled={closePending}
                onClick={handleCloseBill}
                className="clay clay-primary h-12 w-full rounded-full text-[15px] font-semibold"
              >
                {closePending && <Loader2 className="animate-spin" />}
                Cerrar cuenta
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
