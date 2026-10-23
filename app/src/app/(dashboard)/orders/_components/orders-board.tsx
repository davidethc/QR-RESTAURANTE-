"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChefHat, ClipboardList, Inbox, PackageCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import { posPressable, toneBar, toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { segmentedItemClass, segmentedListClass } from "@/components/shared/segmented-control";
import { OrderCard } from "./order-card";
import { CallCard } from "./call-card";
import {
  useLiveActions,
  useLiveCalls,
  useLiveOrders,
} from "../../_components/staff-live-provider";
import { useDeferredDelivery } from "@/hooks/use-deferred-delivery";
import type { UserRole } from "@/config/constants";
import { cn } from "@/lib/utils";
import type { StaffOrder, StaffWaiterCall } from "@/types/staff";

type ColumnId = "pending" | "progress" | "ready" | "calls";
type SourceFilter = "all" | "qr" | "staff";

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "qr", label: "Por QR" },
  { value: "staff", label: "Del personal" },
];

interface Column {
  id: ColumnId;
  title: string;
  metricLabel: string;
  tone: PosTone;
  icon: LucideIcon;
  count: number;
  /** Algo en esta columna espera una acción del personal. */
  urgent: boolean;
  empty: { title: string; description: string };
  content: React.ReactNode[];
}

export function OrdersBoard({
  initialOrders,
  initialCalls,
  initialTableFilter,
  initialView,
  role,
  billingEnabled = false,
  maxWaiterDiscountPct = 0,
  tableSessionMap = {},
  readyStep = true,
  summaryDetail,
  actions,
  emptyAction,
}: {
  /** Ya no se usa aquí (el proveedor del layout conoce el restaurante); se conserva por compatibilidad con la página. */
  restaurantId?: string;
  initialOrders: StaffOrder[];
  initialCalls: StaffWaiterCall[];
  initialTableFilter: number | null;
  initialView?: "calls" | "progress" | "ready" | null;
  role?: UserRole;
  /** Módulo de cobro (M5). Con false, "Pedir cuenta" se sigue atendiendo como hoy. */
  billingEnabled?: boolean;
  maxWaiterDiscountPct?: number;
  /** mesa -> sesión viva, para abrir la hoja de cobro desde la tarjeta de solicitud. */
  tableSessionMap?: Record<string, string>;
  /** Ajuste `kitchen_ready_step`. Con false la cocina nunca marca "Listo":
   *  no hay columna "Listos" y entregar no pide confirmación. */
  readyStep?: boolean;
  /** Línea bajo "Pedidos" en la franja (pedidos de hoy, mesas ocupadas). */
  summaryDetail?: string;
  /** Acciones de la franja (Nuevo pedido, Tomar en mesa). */
  actions?: React.ReactNode;
  /** Acción de los vacíos de "Nuevos" (p. ej. Nuevo pedido). */
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  // Datos en vivo del `StaffLiveProvider` (una sola suscripción para todo
  // el panel). Hasta que cargan, los que trajo el servidor. El "en vivo"
  // ya se ve en la barra superior del panel.
  const orders = useLiveOrders() ?? initialOrders;
  const calls = useLiveCalls() ?? initialCalls;
  const { afterMutation, removeOrder } = useLiveActions();
  const [tableFilter, setTableFilter] = useState(initialTableFilter);
  const [source, setSource] = useState<SourceFilter>("all");
  const sourceRefs = useRef(new Map<SourceFilter, HTMLButtonElement>());
  // Al entrar filtrado por una mesa (clic desde /tables), la columna
  // inicial debe ser la que de verdad tiene algo que atender en ESA mesa.
  // Sin filtro, "Nuevos" salvo que se llegue con `?view=calls|progress|ready`
  // (el "Ver" de un aviso o un atajo de Hoy). En pantallas anchas se ven
  // todas las columnas a la vez; esto decide cuál se ve en tablet/teléfono.
  const [activeTab, setActiveTab] = useState<ColumnId>(() => {
    if (initialView === "calls") return "calls";
    if (initialView === "progress") return "progress";
    if (initialView === "ready") return readyStep ? "ready" : "progress";
    if (initialTableFilter === null) return "pending";
    const ordersForTable = initialOrders.filter((o) => o.table_number === initialTableFilter);
    const callsForTable = initialCalls.filter((c) => c.table_number === initialTableFilter);
    if (callsForTable.length > 0) return "calls";
    if (ordersForTable.some((o) => o.status === "PENDING")) return "pending";
    if (ordersForTable.some((o) => o.status === "ACCEPTED" || o.status === "PREPARING")) return "progress";
    if (ordersForTable.some((o) => o.status === "READY")) return readyStep ? "ready" : "progress";
    return "pending";
  });

  // Los toasts de "pedido nuevo"/"listo"/"solicitud" no se disparan
  // acá: viven una sola vez en `DashboardNotifier` (layout del dashboard).

  const { pendingIds, scheduleDelivery } = useDeferredDelivery(async (orderId) => {
    removeOrder(orderId);
    afterMutation();
  });

  const clearTableFilter = useCallback(() => {
    setTableFilter(null);
    router.replace("/orders");
  }, [router]);

  // Los que esperan su "Deshacer" ya no se muestran: para el mesero
  // están entregados.
  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          !pendingIds.has(o.id) &&
          (tableFilter === null || o.table_number === tableFilter) &&
          (source === "all" || (source === "qr") === (o.source === "digital_menu"))
      ),
    [orders, tableFilter, pendingIds, source]
  );
  const visibleCalls = useMemo(
    () => (tableFilter === null ? calls : calls.filter((c) => c.table_number === tableFilter)),
    [calls, tableFilter]
  );

  const { pending, inProgress, ready } = useMemo(
    () => ({
      pending: visibleOrders.filter((o) => o.status === "PENDING"),
      // Sin paso "Listo" no debería haber READY; si queda alguno (lo marcó
      // un dueño a mano), se entrega desde "En cocina" en vez de perderse.
      inProgress: visibleOrders.filter(
        (o) => o.status === "ACCEPTED" || o.status === "PREPARING" || (!readyStep && o.status === "READY")
      ),
      ready: readyStep ? visibleOrders.filter((o) => o.status === "READY") : [],
    }),
    [visibleOrders, readyStep]
  );

  const renderOrder = (order: StaffOrder) => (
    <OrderCard
      key={order.id}
      order={order}
      onDone={afterMutation}
      onDeliver={() => scheduleDelivery(order.id, `Pedido #${order.order_number} entregado`)}
      confirmNotReady={readyStep}
    />
  );

  const pendingCalls = visibleCalls.filter((c) => c.status === "PENDING").length;
  const filtered = source !== "all";

  const columns: Column[] = [
    {
      id: "pending",
      title: "Nuevos",
      metricLabel: "Por aprobar",
      tone: "attention",
      icon: Inbox,
      count: pending.length,
      urgent: pending.length > 0,
      empty: filtered
        ? { title: "Nada nuevo con este filtro", description: "Cambia a Todos para ver el resto." }
        : { title: "No hay pedidos nuevos", description: "Los pedidos por QR llegan aquí para aprobarlos." },
      content: pending.map(renderOrder),
    },
    {
      id: "progress",
      title: "En cocina",
      metricLabel: "En cocina",
      tone: "info",
      icon: ChefHat,
      count: inProgress.length,
      urgent: false,
      empty: { title: "Nada en cocina", description: "Todo está al día." },
      content: inProgress.map(renderOrder),
    },
    ...(readyStep
      ? [
          {
            id: "ready" as const,
            title: "Listos",
            metricLabel: "Por entregar",
            tone: "money-in" as const,
            icon: PackageCheck,
            count: ready.length,
            urgent: ready.length > 0,
            empty: { title: "No hay pedidos listos", description: "Cocina avisará cuando termine uno." },
            content: ready.map(renderOrder),
          },
        ]
      : []),
    {
      id: "calls",
      title: "Solicitudes",
      metricLabel: "Solicitudes",
      tone: pendingCalls > 0 ? "attention" : "neutral",
      icon: Bell,
      count: visibleCalls.length,
      urgent: pendingCalls > 0,
      empty: { title: "No hay solicitudes", description: "Cuando una mesa llame o pida la cuenta, aparece aquí." },
      content: visibleCalls.map((call) => (
        <CallCard
          key={call.id}
          call={call}
          onDone={afterMutation}
          billingEnabled={billingEnabled}
          role={role}
          maxWaiterDiscountPct={maxWaiterDiscountPct}
          tableSessionId={tableSessionMap[call.table_id]}
        />
      )),
    },
  ];

  const toAttend = pending.length + pendingCalls + ready.length;

  function onSourceKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = SOURCE_FILTERS[(index + step + SOURCE_FILTERS.length) % SOURCE_FILTERS.length].value;
    setSource(next);
    sourceRefs.current.get(next)?.focus();
  }

  return (
    <>
      <section
        aria-label="Estado de los pedidos"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
          <StatusPill
            tone={toAttend > 0 ? "attention" : "money-in"}
            icon={ClipboardList}
            title={toAttend > 0 ? `${toAttend} por atender` : "Todo al día"}
            detail={summaryDetail}
          />
          <div className="flex flex-wrap items-stretch gap-2 border-border sm:border-l sm:pl-4">
            {columns.map((c) => (
              <StatusMetric
                key={c.id}
                label={c.metricLabel}
                value={String(c.count)}
                tone={c.count > 0 ? c.tone : "neutral"}
                icon={c.icon}
              />
            ))}
          </div>
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </section>

      <div className="flex flex-col gap-4 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Origen del pedido" className={segmentedListClass()}>
            {SOURCE_FILTERS.map((f, i) => {
              const active = source === f.value;
              return (
                <button
                  key={f.value}
                  ref={(el) => {
                    if (el) sourceRefs.current.set(f.value, el);
                    else sourceRefs.current.delete(f.value);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setSource(f.value)}
                  onKeyDown={(e) => onSourceKey(e, i)}
                  className={segmentedItemClass(active, "md", "h-10 px-4 text-body-sm font-semibold")}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {tableFilter !== null && (
            <span className="inline-flex h-11 items-center gap-1 rounded-full border border-info-border bg-info-soft pl-3.5 pr-1 text-body-sm font-semibold text-info-soft-foreground">
              Solo Mesa {tableFilter}
              <button
                type="button"
                onClick={clearTableFilter}
                aria-label="Ver todas las mesas"
                className={cn(posPressable, "flex size-9 items-center justify-center rounded-full hover:bg-card")}
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          )}
        </div>

        {/* Tablet y teléfono: una columna a la vez, elegida con estas pestañas. */}
        <div className="no-scrollbar -mx-4 overflow-x-auto border-b border-border px-4 md:-mx-5 md:px-5 xl:hidden">
          <div role="tablist" aria-label="Columnas del tablero" className="flex min-w-max">
            {columns.map((c) => {
              const active = activeTab === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  id={`orders-tab-${c.id}`}
                  aria-selected={active}
                  aria-controls={`orders-col-${c.id}`}
                  onClick={() => setActiveTab(c.id)}
                  className={cn(
                    "relative -mb-px flex min-h-12 items-center gap-1.5 border-b-2 px-2.5 text-body-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none",
                    active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <c.icon className="size-4" aria-hidden />
                  {c.title}
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-caption leading-none tabular-nums",
                      c.count > 0 ? toneSoft[c.tone] : "border-transparent bg-secondary text-muted-foreground"
                    )}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={cn(
            "grid items-start gap-4",
            columns.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
          )}
        >
          {columns.map((c) => (
            <section
              key={c.id}
              id={`orders-col-${c.id}`}
              aria-labelledby={`orders-col-${c.id}-title`}
              className={cn(
                "flex-col overflow-hidden rounded-card border border-border bg-secondary/60",
                activeTab === c.id ? "flex" : "hidden xl:flex"
              )}
            >
              <header className="relative flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-3">
                <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", toneBar[c.tone])} />
                <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border", toneSoft[c.tone])}>
                  <c.icon className="size-4" />
                </span>
                <h2 id={`orders-col-${c.id}-title`} className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">
                  {c.title}
                </h2>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-body-sm font-semibold leading-tight tabular-nums",
                    c.urgent ? toneSoft[c.tone] : "border-border bg-secondary text-muted-foreground"
                  )}
                >
                  {c.count}
                </span>
              </header>
              <div className="flex flex-col gap-3 p-3 md:grid md:grid-cols-2 md:items-start xl:flex xl:flex-col">
                {c.content.length > 0 ? (
                  c.content
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-border bg-card/60 px-4 py-8 text-center md:col-span-2">
                    <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                      <c.icon className="size-5" />
                    </span>
                    <p className="text-body-sm font-semibold text-foreground">{c.empty.title}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{c.empty.description}</p>
                    {filtered && c.id === "pending" ? (
                      <button
                        type="button"
                        onClick={() => setSource("all")}
                        className={cn(posPressable, "mt-1 flex min-h-11 items-center gap-1.5 rounded-button px-3 text-body-sm font-semibold text-foreground hover:bg-muted")}
                      >
                        <X className="size-4" aria-hidden /> Quitar filtro
                      </button>
                    ) : (
                      emptyAction && <div className={cn("mt-1", c.id !== "pending" && "xl:hidden")}>{emptyAction}</div>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
