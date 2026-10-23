"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, History, KeyRound, Lock, Receipt, ReceiptText } from "lucide-react";
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
      <CajaHeader
        status={
          <>
            <StatusPill tone="money-in" icon={Lock} title={`${activeName} · abierta`} detail={openedAt ? `Desde las ${openedAt}` : undefined} />
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

      <div className="grid gap-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(19rem,34%)_minmax(0,1fr)]">
        <section aria-labelledby="queue-title" className="flex min-h-0 flex-col gap-4 px-4 py-4 md:px-5 lg:overflow-y-auto lg:border-r lg:border-border">
          {canTakeOrders && (
            <NewOrderFlow
              canCharge
              billingEnabled={billingEnabled}
              onChargeNow={(id, label) => select(id, label)}
              className="min-h-14 rounded-button bg-money-in text-money-in-foreground hover:bg-money-in/90"
            />
          )}
          <h2 id="queue-title" className="sr-only">
            Cuentas abiertas
          </h2>
          <BillQueue bills={queue} selectedId={selected?.id ?? null} onSelect={(b) => select(b.table_session_id, b.place_label)} empty={emptyQueue} />
          {canManage && closedToday.length > 0 && (
            <details className="group rounded-card border border-border bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-card px-4 text-body-sm font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none">
                <Receipt className="size-4 text-muted-foreground" aria-hidden /> Cobradas hoy
                <span className="rounded-full bg-secondary px-2 py-0.5 text-caption tabular-nums text-muted-foreground">{closedToday.length}</span>
                <span className="ml-auto text-meta font-medium text-muted-foreground group-open:hidden">Ver</span>
              </summary>
              <div className="px-4 pb-4">
                <ClosedBillsToday bills={closedToday} timeZone={timeZone} />
              </div>
            </details>
          )}
        </section>

        <section aria-label="Cobro" className="hidden min-h-0 bg-background lg:flex lg:flex-col">
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
      className="flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-button px-3 text-body-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <History className="size-5" aria-hidden /> <span className="max-2xl:sr-only">Historial</span>
    </Link>
  );
}

/** Panel derecho sin cuenta elegida: qué hacer, en tres pasos. */
function CheckoutGuide() {
  const steps = [
    { n: 1, title: "Elige la cuenta", text: "Toca una cuenta de la lista." },
    { n: 2, title: "Revisa el pedido", text: "Verifica los productos y el total." },
    { n: 3, title: "Cobra", text: "Elige cómo pagan y el método." },
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-8 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-20 items-center justify-center rounded-3xl border border-border bg-card text-muted-foreground shadow-sm">
          <ReceiptText className="size-9" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-title-sm font-semibold text-foreground">Selecciona una cuenta</h2>
          <p className="max-w-sm text-body-sm text-muted-foreground">Elige una cuenta de la lista para ver su detalle y cobrarla.</p>
        </div>
      </div>
      <ol className="grid w-full max-w-xl gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="flex flex-col items-start gap-1.5 rounded-card border border-border bg-card p-4 text-left">
            <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-caption font-bold tabular-nums text-background">{s.n}</span>
            <span className="text-body-sm font-semibold text-foreground">{s.title}</span>
            <span className="text-meta leading-snug text-muted-foreground">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Cabecera de Caja: estado de la caja y sus cifras a la izquierda, acciones
 * de dinero a la derecha. Envuelve en vez de recortar: en tablet las
 * acciones bajan a su propia fila y ninguna cifra queda tapada.
 */
function CajaHeader({
  status,
  metrics,
  actions,
}: {
  status: React.ReactNode;
  metrics: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <section aria-label="Estado de la caja" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        {status}
        <div className="flex flex-wrap items-stretch gap-x-4 gap-y-2 border-l border-border pl-4">{metrics}</div>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </section>
  );
}
