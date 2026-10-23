"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, History, KeyRound, Receipt, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusMetric, StatusPill, StatusStrip } from "@/components/shared/status-strip";
import { posPressable } from "@/components/shared/pos-tone";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn, formatPrice } from "@/lib/utils";
import type { Bill, CashSessionSummary, OpenBillSummary } from "@/types/billing";
import type { ClosedBillToday } from "@/lib/queries/cash";
import { BillQueue } from "./bill-queue";
import { CashCutButton, CashCutWizard } from "./cash-cut-wizard";
import { CashFlowActions } from "./cash-flow-actions";
import { useChargeSheet } from "./charge-sheet-host";
import { CheckoutPanel } from "./checkout/checkout-panel";
import { ClosedBillsToday } from "./closed-bills-today";
import { NewOrderFlow } from "./new-order/new-order-flow";
import { OpenCashGate, type ClosedRegister } from "./open-cash-gate";

/**
 * Caja como punto de venta: franja de estado arriba (caja, efectivo, ventas
 * y acciones de dinero), "Por cobrar" a la izquierda y el cobro de la cuenta
 * elegida a la derecha. En teléfono la lista ocupa todo y el cobro se abre
 * en la hoja de cobro a pantalla completa. Con la caja cerrada solo se ve
 * "Abrir caja": nada se puede cobrar sin turno.
 */
export function CashWorkspace({
  summaries,
  closedRegisters,
  bills,
  closedToday,
  canManage,
  canTakeOrders,
  billingEnabled,
  timeZone,
  initialSelected,
  live,
}: {
  summaries: CashSessionSummary[];
  closedRegisters: ClosedRegister[];
  bills: OpenBillSummary[];
  closedToday: ClosedBillToday[];
  canManage: boolean;
  canTakeOrders: boolean;
  billingEnabled: boolean;
  timeZone: string;
  initialSelected: string | null;
  live: React.ReactNode;
}) {
  const router = useRouter();
  const { openCharge } = useChargeSheet();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [activeSessionId, setActiveSessionId] = useState(summaries[0]?.id ?? null);
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(() => {
    const b = bills.find((x) => x.table_session_id === initialSelected);
    return b ? { id: b.table_session_id, label: b.place_label } : null;
  });
  const [overrides, setOverrides] = useState<Record<string, Partial<OpenBillSummary> | "closed">>({});
  const [cutOpen, setCutOpen] = useState(false);
  const [openAnother, setOpenAnother] = useState(false);

  const active = summaries.find((s) => s.id === activeSessionId) ?? summaries[0] ?? null;

  // Lo que devolvió el cobro se refleja en la lista al instante, sin esperar
  // al refresco del servidor (que llega igual por tiempo real).
  const queue = useMemo(
    () =>
      bills
        .filter((b) => overrides[b.table_session_id] !== "closed")
        .map((b) => {
          const o = overrides[b.table_session_id];
          return o && o !== "closed" ? { ...b, ...o } : b;
        }),
    [bills, overrides]
  );

  const select = useCallback(
    (id: string, label: string) => {
      if (!isWide) {
        openCharge({ tableSessionId: id, tableLabel: label });
        return;
      }
      setSelected({ id, label });
      try {
        window.history.replaceState(null, "", `/cash?cuenta=${id}`);
      } catch {}
    },
    [isWide, openCharge]
  );

  const clearSelection = useCallback(() => {
    setSelected(null);
    try {
      window.history.replaceState(null, "", "/cash");
    } catch {}
  }, []);

  const onBillChange = useCallback((bill: Bill) => {
    setOverrides((prev) => ({
      ...prev,
      [bill.table_session_id]:
        bill.status === "CLOSED" || bill.status === "VOID"
          ? "closed"
          : { status: bill.status, balance: bill.balance, paid_total: bill.paid_total, total: bill.total, id: bill.id },
    }));
  }, []);

  if (!active) {
    return (
      <>
        <StatusStrip
          status={<StatusPill tone="attention" icon={KeyRound} title="Caja cerrada" detail="Ábrela para cobrar y tomar pedidos" />}
          actions={
            <>
              {live}
              <HistoryLink />
            </>
          }
        />
        <div className="px-4 py-8 md:px-8 md:py-12">
          <OpenCashGate registers={closedRegisters} />
        </div>
      </>
    );
  }

  const openedAt = active.opened_at
    ? new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(active.opened_at))
    : null;
  const cash = active.by_method?.find((m) => m.method === "CASH");
  const owed = queue.filter((b) => b.balance > 0);
  const owedTotal = owed.reduce((sum, b) => sum + b.balance, 0);
  const salesTotal = closedToday.reduce((sum, b) => sum + b.total, 0);
  const activeName = active.register_name ?? "Caja";

  const emptyQueue = (
    <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-border px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <ClipboardList className="size-6" aria-hidden />
      </span>
      <p className="text-body font-semibold text-foreground">No hay nada por cobrar</p>
      <p className="max-w-xs text-body-sm text-muted-foreground">
        {canTakeOrders
          ? "Toma un pedido nuevo: para llevar, a una mesa o a domicilio."
          : "Cuando una mesa o un pedido tenga cuenta abierta, aparece aquí."}
      </p>
    </div>
  );

  return (
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:flex-col">
      <StatusStrip
        status={
          <>
            <StatusPill tone="money-in" icon={Unlock} title={`${activeName} · abierta`} detail={openedAt ? `Desde las ${openedAt}` : undefined} />
            {summaries.length > 1 && (
              <div role="radiogroup" aria-label="Caja activa" className="flex shrink-0 gap-1">
                {summaries.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === active.id}
                    onClick={() => setActiveSessionId(s.id)}
                    className={cn(
                      posPressable,
                      "min-h-11 rounded-full border px-3 text-body-sm font-semibold",
                      s.id === active.id ? "border-foreground bg-foreground text-background" : "border-border bg-card"
                    )}
                  >
                    {s.register_name}
                  </button>
                ))}
              </div>
            )}
          </>
        }
        metrics={
          <>
            {active.can_see_expected && cash ? (
              <StatusMetric label="En el cajón" value={formatPrice(cash.expected)} tone="money-in" />
            ) : (
              <StatusMetric label="Cobrado en efectivo" value={formatPrice(cash?.payments_total ?? 0)} />
            )}
            <StatusMetric label={`Por cobrar · ${owed.length}`} value={formatPrice(owedTotal)} tone={owed.length > 0 ? "attention" : "neutral"} />
            {canManage && <StatusMetric label={`Ventas de hoy · ${closedToday.length}`} value={formatPrice(salesTotal)} />}
          </>
        }
        actions={
          <>
            <CashFlowActions session={{ id: active.id, name: activeName }} />
            <CashCutButton onClick={() => setCutOpen(true)} />
            {closedRegisters.length > 0 && (
              <button
                type="button"
                onClick={() => setOpenAnother(true)}
                className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button px-3 text-body-sm font-semibold text-foreground hover:bg-muted")}
              >
                <KeyRound className="size-4" aria-hidden /> Abrir otra caja
              </button>
            )}
            <HistoryLink />
            {live}
          </>
        }
      />

      <div className="grid gap-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <section aria-labelledby="queue-title" className="flex min-h-0 flex-col gap-4 px-4 py-4 md:px-6 lg:overflow-y-auto lg:border-r lg:border-border">
          {canTakeOrders && (
            <NewOrderFlow
              canCharge
              billingEnabled={billingEnabled}
              onChargeNow={(id, label) => select(id, label)}
            />
          )}
          <div className="flex items-baseline justify-between">
            <h2 id="queue-title" className="text-lead font-semibold text-foreground">
              Por cobrar
            </h2>
            <span className="text-meta tabular-nums text-muted-foreground">
              {owed.length} {owed.length === 1 ? "cuenta" : "cuentas"}
            </span>
          </div>
          <BillQueue bills={queue} selectedId={selected?.id ?? null} onSelect={(b) => select(b.table_session_id, b.place_label)} empty={emptyQueue} />
          {canManage && closedToday.length > 0 && (
            <details className="group rounded-card bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-body-sm font-semibold text-foreground">
                <Receipt className="size-4" aria-hidden /> Cobradas hoy ({closedToday.length})
                <span className="ml-auto text-muted-foreground group-open:hidden">Ver</span>
              </summary>
              <div className="px-4 pb-4">
                <ClosedBillsToday bills={closedToday} timeZone={timeZone} />
              </div>
            </details>
          )}
        </section>

        <section aria-label="Cobro" className="hidden min-h-0 lg:flex lg:flex-col">
          {selected ? (
            <CheckoutPanel
              key={selected.id}
              tableSessionId={selected.id}
              fallbackLabel={selected.label}
              canManage={canManage}
              onBillChange={onBillChange}
              onSettled={() => {
                clearSelection();
                router.refresh();
              }}
              onClose={clearSelection}
            />
          ) : (
            <CheckoutGuide />
          )}
        </section>
      </div>

      <CashCutWizard open={cutOpen} onOpenChange={setCutOpen} cashSessionId={active.id} registerName={activeName} />

      <Dialog open={openAnother} onOpenChange={setOpenAnother}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Abrir otra caja</DialogTitle>
            <DialogDescription>Cada caja lleva su propio efectivo y su propio corte.</DialogDescription>
          </DialogHeader>
          <OpenCashGate compact registers={closedRegisters} onOpened={() => setOpenAnother(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryLink() {
  return (
    <Link
      href="/cash/cortes"
      className="flex min-h-12 items-center gap-2 rounded-button px-3 text-body-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <History className="size-4" aria-hidden /> Historial
    </Link>
  );
}

/** Panel derecho sin cuenta elegida: cómo se cobra, en tres pasos. */
function CheckoutGuide() {
  const steps = [
    { n: 1, title: "Elige la cuenta", text: "Toca una tarjeta de Por cobrar." },
    { n: 2, title: "¿Cómo pagan?", text: "Todo junto, partes iguales o por productos." },
    { n: 3, title: "Cobra", text: "Efectivo con vuelto, tarjeta o transferencia." },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-money-in-soft text-money-in-soft-foreground">
        <Receipt className="size-8" aria-hidden />
      </span>
      <div>
        <h2 className="text-title-sm font-semibold text-foreground">Aquí se cobra</h2>
        <p className="text-body text-muted-foreground">Elige una cuenta de la izquierda para ver su detalle y cobrarla.</p>
      </div>
      <ol className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="flex flex-col items-start gap-1 rounded-card bg-card p-4 text-left shadow-sm">
            <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-caption font-bold text-background">{s.n}</span>
            <span className="text-body font-semibold text-foreground">{s.title}</span>
            <span className="text-meta text-muted-foreground">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
