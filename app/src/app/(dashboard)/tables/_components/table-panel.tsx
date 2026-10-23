"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  BellRing,
  Check,
  ChefHat,
  Clock,
  DoorOpen,
  Loader2,
  type LucideIcon,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { posPressable, toneSolid, toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { useChargeSheet } from "@/app/(dashboard)/cash/_components/charge-sheet-host";
import { acceptOrder, cancelOrderWithReason, openTable, rejectOrder, reopenTable, transferOrder } from "@/lib/actions/orders";
import { closeTableSession } from "@/lib/actions/tables";
import { forceCloseTableSession } from "@/lib/actions/billing";
import { cancelOrderWithReasonSchema } from "@/lib/validations/orders";
import { forceCloseTableSchema } from "@/lib/validations/billing";
import { canHandleMoney } from "@/lib/permissions";
import { formatElapsed } from "@/lib/bill-queue";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";
import type { PanelTable } from "@/lib/queries/tables-panel";
import type { OrderStatus, UserRole } from "@/config/constants";
import { isOccupied, openBalance, tableLabel, tableStates } from "./table-state";

/** Same reasons the order board offers when rejecting a QR order. */
const REJECT_REASONS = [
  "Producto agotado",
  "Producto no disponible",
  "Error en el pedido",
  "El restaurante no puede procesarlo",
  "Otro",
] as const;

type View =
  | { kind: "main" }
  | { kind: "transfer" }
  | { kind: "cancel" }
  | { kind: "reject"; orderId: string; folio: number }
  | { kind: "release" }
  | { kind: "force" };

export interface TablePanelProps {
  table: PanelTable;
  zoneName: string;
  zoneTables: PanelTable[];
  justOpenedSessionId: string | null;
  onOpened: (sessionId: string) => void;
  onClose: () => void;
  /** Runs before the charge sheet opens (the phone sheet closes first: no sheet over sheet). */
  onBeforeCharge?: () => void;
  role: UserRole;
  canServeTable: boolean;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
  minutes: number | null;
}

/**
 * Everything you can do with one table, in place: no menus, no dialog on
 * top of the sheet. Sub-steps (transfer, cancel, reject, release) replace the
 * panel body and always offer "Volver". Role guards are the same as before:
 * waiter, admin and owner serve tables; charging needs cash.manage; forcing a
 * close is owner/admin only.
 */
export function TablePanel({
  table,
  zoneName,
  zoneTables,
  justOpenedSessionId,
  onOpened,
  onClose,
  onBeforeCharge,
  role,
  canServeTable,
  billingEnabled,
  maxWaiterDiscountPct,
  minutes,
}: TablePanelProps) {
  const router = useRouter();
  const { openCharge } = useChargeSheet();
  const [view, setView] = useState<View>({ kind: "main" });
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [reason, setReason] = useState<string>(REJECT_REASONS[0]);
  const [error, setError] = useState<string | null>(null);

  const label = tableLabel(table);
  const sessionId = table.sessionId ?? justOpenedSessionId;
  const occupied = isOccupied(table, justOpenedSessionId ? { [table.id]: justOpenedSessionId } : {});
  const states = tableStates(table, occupied);
  const main = states[0];
  const MainIcon = main.icon;
  const order = table.orders[0] ?? null;
  const balance = openBalance(table);
  const free = zoneTables.filter((t) => !isOccupied(t, {}) && t.id !== table.id);

  const handlesMoney = canHandleMoney(role);
  const canForceClose = role === "OWNER" || role === "ADMIN";
  const chargeMode: "charge" | "admin-charges" | "release" | null = !canServeTable
    ? null
    : billingEnabled && sessionId
      ? handlesMoney
        ? "charge"
        : "admin-charges"
      : "release";

  function back() {
    setView({ kind: "main" });
    setText("");
    setError(null);
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error);
        notify.error(r.error);
        return;
      }
      notify.success(success);
      after?.();
      router.refresh();
    });
  }

  function open() {
    startTransition(async () => {
      const r = await openTable(table.id);
      if (!r.ok) return notify.error(r.error);
      onOpened(r.data.sessionId);
      notify.success(`${label} abierta`);
      router.refresh();
    });
  }

  function charge() {
    if (!sessionId) return;
    onBeforeCharge?.();
    openCharge({ tableSessionId: sessionId, tableLabel: label, maxWaiterDiscountPct });
  }

  function cancel() {
    if (!order) return;
    const parsed = cancelOrderWithReasonSchema.safeParse({ orderId: order.id, reason: text });
    if (!parsed.success) {
      setError(parsed.error.issues.find((i) => i.path[0] === "reason")?.message ?? "Escribe el motivo.");
      return;
    }
    run(() => cancelOrderWithReason(order.id, parsed.data.reason), "Pedido cancelado", onClose);
  }

  function forceClose() {
    const parsed = forceCloseTableSchema.safeParse({ tableId: table.id, reason: text });
    if (!parsed.success) {
      setError(parsed.error.issues.find((i) => i.path[0] === "reason")?.message ?? "Escribe el motivo.");
      return;
    }
    run(() => forceCloseTableSession(parsed.data), "Mesa liberada sin cobrar", onClose);
  }

  const header = (
    <header className="flex items-start gap-3 border-b border-border bg-card px-4 py-4 md:px-5">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-control border", toneSoft[main.tone])}>
        <MainIcon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-title-sm font-semibold leading-tight text-foreground">{label}</h2>
        <p className="truncate text-meta text-muted-foreground">
          {zoneName}
          {table.customerLabel ? ` · ${table.customerLabel}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {states.map((s) => {
            const Icon = s.icon;
            return (
              <span
                key={s.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold leading-tight",
                  toneSoft[s.tone],
                  s.tone === "neutral" && "bg-secondary text-muted-foreground"
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {s.label}
              </span>
            );
          })}
          {occupied && minutes !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-caption font-semibold leading-tight text-muted-foreground">
              <Clock className="size-3.5" aria-hidden /> <span suppressHydrationWarning>{formatElapsed(minutes)}</span>
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar detalle de la mesa"
        className={cn(posPressable, "flex size-12 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground")}
      >
        <X className="size-5" aria-hidden />
      </button>
    </header>
  );

  if (view.kind !== "main") {
    const sub = SUB_COPY[view.kind];
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div key={view.kind} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 animate-pos-step motion-reduce:animate-none md:px-5">
          <button
            type="button"
            onClick={back}
            className={cn(posPressable, "-ml-2 mb-3 flex min-h-12 items-center gap-2 rounded-button px-2 text-body-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            <ArrowLeft className="size-4" aria-hidden /> Volver
          </button>
          <h3 className="text-lead font-semibold text-foreground">
            {view.kind === "reject" ? `Rechazar pedido #${view.folio}` : sub.title}
          </h3>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {view.kind === "transfer" && free.length === 0 ? "No hay mesas libres en esta zona en este momento." : sub.description(label)}
          </p>

          {view.kind === "transfer" && (
            <ul className="mt-4 grid grid-cols-2 gap-2 @container sm:grid-cols-3">
              {zoneTables.map((t) => {
                const current = t.id === table.id;
                const busy = isOccupied(t, {});
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={current || busy || pending}
                      onClick={() => order && run(() => transferOrder(order.id, t.id), "Pedido transferido", onClose)}
                      className={cn(
                        posPressable,
                        "flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-control border-2 px-2 text-body font-semibold",
                        current ? "border-foreground bg-foreground text-background disabled:opacity-100" : busy ? "border-border bg-secondary text-muted-foreground" : "border-border bg-card text-foreground hover:border-money-in-border hover:bg-money-in-soft"
                      )}
                    >
                      <span className="max-w-full truncate">{tableLabel(t)}</span>
                      <span className="text-caption font-medium">{current ? "Actual" : busy ? "Ocupada" : "Libre"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {view.kind === "reject" && (
            <div role="radiogroup" aria-label="Motivo del rechazo" className="mt-4 flex flex-wrap gap-2">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    posPressable,
                    "flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-body-sm font-semibold",
                    reason === r ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
                  )}
                >
                  {reason === r && <Check className="size-4" aria-hidden />} {r}
                </button>
              ))}
            </div>
          )}

          {(view.kind === "cancel" || view.kind === "force" || (view.kind === "reject" && reason === "Otro")) && (
            <div className="mt-4">
              <label htmlFor="table-reason" className="mb-1.5 block text-body-sm font-semibold text-foreground">
                Motivo
              </label>
              <Textarea
                id="table-reason"
                rows={3}
                value={text}
                placeholder={view.kind === "reject" ? "Describe el motivo" : undefined}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                className="rounded-control text-body"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-body-sm font-medium text-money-out-soft-foreground">
              {error}
            </p>
          )}
        </div>

        {view.kind !== "transfer" && (
          <footer className="border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-5">
            <button
              type="button"
              disabled={pending || (view.kind === "reject" && reason === "Otro" && !text.trim())}
              onClick={() => {
                if (view.kind === "cancel") cancel();
                else if (view.kind === "force") forceClose();
                else if (view.kind === "release") run(() => closeTableSession(table.id), "Mesa liberada", onClose);
                else if (view.kind === "reject") {
                  const final = reason === "Otro" ? text.trim() : reason;
                  run(() => rejectOrder(view.orderId, final), "Pedido rechazado", back);
                }
              }}
              className={cn(
                posPressable,
                "flex min-h-14 w-full items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md",
                view.kind === "release" ? toneSolid.neutral : toneSolid["money-out"]
              )}
            >
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
              {sub.confirm}
            </button>
          </footer>
        )}
      </div>
    );
  }

  const actions: { key: string; label: string; detail: string; icon: LucideIcon; tone: PosTone; href?: string; onClick?: () => void }[] = [];
  if (occupied && canServeTable && order) {
    actions.push({ key: "account", label: "Ver cuenta", detail: "Comandas, editar e imprimir", icon: ReceiptText, tone: "info", href: `/tables/${table.id}/order?vista=enviado` });
    actions.push({ key: "transfer", label: "Transferir", detail: "Mover a otra mesa", icon: ArrowRightLeft, tone: "neutral", onClick: () => setView({ kind: "transfer" }) });
  }
  if (occupied && canServeTable && table.billRequested && sessionId) {
    actions.push({
      key: "reopen",
      label: "Reabrir mesa",
      detail: "Para agregar productos",
      icon: RotateCcw,
      tone: "neutral",
      onClick: () => run(() => reopenTable(sessionId), "Mesa reabierta"),
    });
  }
  if (occupied && chargeMode === "release") {
    actions.push({ key: "release", label: "Liberar mesa", detail: "Ya se cobró por fuera", icon: DoorOpen, tone: "neutral", onClick: () => setView({ kind: "release" }) });
  }
  if (occupied && chargeMode === "charge" && canForceClose) {
    actions.push({ key: "force", label: "Forzar cierre", detail: "Liberar sin cobrar", icon: ShieldAlert, tone: "neutral", onClick: () => setView({ kind: "force" }) });
  }

  const showCharge = occupied && chargeMode === "charge";
  const primaryIsCharge = showCharge && table.billRequested;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">
        {table.waiterRequested && (
          <Notice
            tone="money-out"
            icon={BellRing}
            title="Llamando al mesero"
            text="Un cliente de esta mesa está pidiendo atención."
            action={{ label: "Atender en Pedidos", href: `/orders?table=${table.number}&view=calls` }}
          />
        )}

        {!occupied ? (
          <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-border px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <DoorOpen className="size-6" aria-hidden />
            </span>
            <p className="text-body font-semibold text-foreground">{label} está libre</p>
            <p className="max-w-xs text-body-sm text-muted-foreground">
              {canServeTable ? "Ábrela cuando se sienten los clientes para empezar a tomar el pedido." : "Cuando la abra un mesero, aquí verás su consumo."}
            </p>
          </div>
        ) : (
          <>
            <section aria-label="Consumo" className="grid grid-cols-2 gap-2">
              <Figure label="Consumo" value={formatPrice(table.total)} />
              {balance !== null && balance > 0 ? (
                <Figure label="Falta cobrar" value={formatPrice(balance)} tone="attention" />
              ) : (
                <Figure label="Pedidos" value={String(table.orders.length)} />
              )}
            </section>

            <section aria-labelledby="table-orders">
              <h3 id="table-orders" className="mb-2 text-body font-semibold text-foreground">
                Pedidos de la mesa
              </h3>
              {order ? (
                <ul className="flex flex-col gap-2">
                  {table.orders.map((o) => (
                    <li key={o.id} className={cn("rounded-card border bg-card p-3", o.status === "PENDING" ? "border-attention-border" : "border-border")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-body-sm font-semibold text-foreground">
                            Pedido #{o.folio} <span className="font-normal text-muted-foreground">· {o.shortCode}</span>
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <OrderStatusBadge status={o.status as OrderStatus} />
                            {o.status === "PENDING" && (
                              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.attention)}>
                                <QrCode className="size-3.5" aria-hidden /> Desde el QR
                              </span>
                            )}
                            {o.isNew && <span className="text-caption font-semibold text-money-in-soft-foreground">Nueva</span>}
                          </div>
                        </div>
                        <span className="shrink-0 text-body font-semibold tabular-nums">{formatPrice(o.total)}</span>
                      </div>
                      {o.status === "PENDING" && canServeTable && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => acceptOrder(o.id), "Pedido aprobado — va a cocina")}
                            className={cn(posPressable, "flex min-h-12 items-center justify-center gap-2 rounded-button text-body font-semibold", toneSolid["money-in"])}
                          >
                            <Check className="size-4" aria-hidden /> Aprobar
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setView({ kind: "reject", orderId: o.id, folio: o.folio })}
                            className={cn(posPressable, "flex min-h-12 items-center justify-center gap-2 rounded-button border-2 border-border bg-card text-body font-semibold text-foreground hover:bg-muted")}
                          >
                            <X className="size-4" aria-hidden /> Rechazar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-body-sm text-muted-foreground">
                  Mesa abierta, todavía sin productos.
                </p>
              )}
            </section>

            {chargeMode === "admin-charges" && (
              <Notice tone="info" icon={Wallet} title="Cobra el administrador" text="Con el cobro activo, el mesero no cobra ni libera la mesa." />
            )}

            {actions.length > 0 && (
              <section aria-label="Acciones de la mesa" className="grid grid-cols-2 gap-2">
                {actions.map((a) => {
                  const Icon = a.icon;
                  const cls = cn(
                    posPressable,
                    "flex min-h-16 items-center gap-3 rounded-card border border-border bg-card p-3 text-left hover:border-border-strong hover:shadow-sm"
                  );
                  const body = (
                    <>
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full border", toneSoft[a.tone])}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-body-sm font-semibold leading-tight text-foreground">{a.label}</span>
                        <span className="block text-caption leading-tight text-muted-foreground">{a.detail}</span>
                      </span>
                    </>
                  );
                  return a.href ? (
                    <Link key={a.key} href={a.href} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <button key={a.key} type="button" disabled={pending} onClick={a.onClick} className={cls}>
                      {body}
                    </button>
                  );
                })}
              </section>
            )}

            {order && canServeTable && (
              <button
                type="button"
                onClick={() => setView({ kind: "cancel" })}
                className={cn(posPressable, "flex min-h-12 w-full items-center justify-center gap-2 rounded-button text-body-sm font-semibold text-money-out-soft-foreground hover:bg-money-out-soft")}
              >
                <Ban className="size-4" aria-hidden /> Cancelar pedido
              </button>
            )}
          </>
        )}
      </div>

      {canServeTable && (
        <footer className="flex flex-col gap-2 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-5">
          {!occupied ? (
            <button
              type="button"
              disabled={pending}
              onClick={open}
              className={cn(posPressable, "flex min-h-14 items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md", toneSolid["money-in"])}
            >
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <DoorOpen className="size-5" aria-hidden />}
              Abrir mesa
            </button>
          ) : (
            <>
              {primaryIsCharge && <ChargeButton total={balance ?? table.total} onClick={charge} primary />}
              <Link
                href={`/tables/${table.id}/order`}
                className={cn(
                  posPressable,
                  "flex items-center justify-center gap-2 rounded-button font-semibold",
                  primaryIsCharge
                    ? "min-h-12 border-2 border-border bg-card text-body text-foreground hover:bg-muted"
                    : cn("min-h-14 text-lead shadow-md", toneSolid.neutral)
                )}
              >
                {order ? <Plus className="size-5" aria-hidden /> : <ChefHat className="size-5" aria-hidden />}
                {order ? "Agregar productos" : "Tomar pedido"}
              </Link>
              {showCharge && !primaryIsCharge && <ChargeButton total={balance ?? table.total} onClick={charge} />}
            </>
          )}
        </footer>
      )}
    </div>
  );
}

const SUB_COPY = {
  transfer: {
    title: "Transferir pedido",
    description: (label: string) => `Elige la mesa libre a la que se mueve el pedido de ${label}.`,
    confirm: "",
  },
  cancel: {
    title: "Cancelar pedido",
    description: () => "El pedido se cancela y no se puede deshacer. Queda registrado con el motivo.",
    confirm: "Cancelar pedido",
  },
  reject: {
    title: "Rechazar pedido",
    description: () => "Elige el motivo. El cliente lo verá en su teléfono.",
    confirm: "Confirmar rechazo",
  },
  release: {
    title: "¿Liberar esta mesa?",
    description: (label: string) =>
      `${label} quedará disponible para el próximo cliente. Úsalo cuando la cuenta se cobró sin pasar por "Pedir cuenta" (efectivo, o el cliente ya se fue).`,
    confirm: "Liberar mesa",
  },
  force: {
    title: "Forzar cierre",
    description: () =>
      "Libera la mesa aunque tenga saldo pendiente. La cuenta sigue abierta y se puede cobrar después desde Caja. Escribe el motivo (el cliente se fue, error de mesa, etc.).",
    confirm: "Forzar cierre",
  },
} as const;

function ChargeButton({ total, onClick, primary = false }: { total: number; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        posPressable,
        "flex items-center justify-center gap-2 rounded-button font-semibold",
        primary ? cn("min-h-14 text-lead shadow-md", toneSolid["money-in"]) : "min-h-12 border-2 border-money-in-border bg-money-in-soft text-body text-money-in-soft-foreground hover:bg-money-in-soft/70"
      )}
    >
      <Wallet className="size-5" aria-hidden /> Cobrar y liberar
      {total > 0 && <span className="tabular-nums">· {formatPrice(total)}</span>}
    </button>
  );
}

function Figure({ label, value, tone = "neutral" }: { label: string; value: string; tone?: PosTone }) {
  return (
    <div className={cn("rounded-card border px-3 py-2.5", tone === "neutral" ? "border-border bg-card" : toneSoft[tone])}>
      <p className={cn("text-caption leading-tight", tone === "neutral" ? "text-muted-foreground" : undefined)}>{label}</p>
      <p className="text-title-sm font-semibold leading-tight tabular-nums">{value}</p>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  text,
  action,
}: {
  tone: PosTone;
  icon: LucideIcon;
  title: string;
  text: string;
  action?: { label: string; href: string };
}) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-card border p-3", toneSoft[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-body-sm font-semibold">{title}</p>
        <p className="text-meta">{text}</p>
        {action && (
          <Link
            href={action.href}
            className={cn(posPressable, "mt-2 inline-flex min-h-12 items-center gap-2 rounded-button border-2 border-current/30 bg-card px-4 text-body-sm font-semibold")}
          >
            {action.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
