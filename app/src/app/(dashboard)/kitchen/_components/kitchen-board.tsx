"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { ChefHat, History, Maximize2, Minimize2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { StatusMetric, StatusPill, StatusStrip } from "@/components/shared/status-strip";
import { useNow } from "@/components/shared/clock";
import { useLiveActions, useLiveEvents } from "@/app/(dashboard)/_components/staff-live-provider";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { completeTicket, setKdsSettings } from "@/lib/actions/kds";
import { readKitchenTickets } from "@/lib/queries/staff-client";
import { notify } from "@/lib/notifications";
import { countPendingTickets, pendingLabel, timerTone, type KdsThresholds, type KitchenTicket, type KitchenTicketsPayload } from "@/lib/kds";
import { KdsTicketCard, TIMER_META } from "./kds-ticket-card";
import { KdsSettings } from "./kds-settings";

/** Comandas por semáforo; reloj de minuto compartido (tic cada 15 s). */
function KitchenMetrics({ tickets, thresholds }: { tickets: KitchenTicket[]; thresholds: KdsThresholds }) {
  const now = useNow("minute");
  const counts = { green: 0, yellow: 0, red: 0 };
  if (now !== null) {
    for (const t of tickets) counts[timerTone((now - new Date(t.created_at).getTime()) / 60000, thresholds)] += 1;
  }
  const show = (n: number) => (now === null ? "—" : String(n));
  return (
    <>
      <StatusMetric
        label={TIMER_META.green.label}
        value={show(counts.green)}
        tone={counts.green > 0 ? "money-in" : "neutral"}
        icon={TIMER_META.green.icon}
      />
      <StatusMetric
        label={`Demoradas · +${thresholds.warn_minutes} min`}
        value={show(counts.yellow)}
        tone={counts.yellow > 0 ? "attention" : "neutral"}
        icon={TIMER_META.yellow.icon}
      />
      <StatusMetric
        label={`Atrasadas · +${thresholds.alert_minutes} min`}
        value={show(counts.red)}
        tone={counts.red > 0 ? "money-out" : "neutral"}
        icon={TIMER_META.red.icon}
      />
    </>
  );
}

/**
 * Tablero de cocina por COMANDAS (tickets), en orden de llegada: la más
 * vieja arriba a la izquierda. Franja de estado arriba con las cifras del
 * semáforo; "Comanda lista" saca la tarjeta al instante (optimista).
 */
export function KitchenBoard({
  restaurantId,
  initial,
  canManage,
}: {
  restaurantId: string;
  initial: KitchenTicketsPayload;
  canManage: boolean;
}) {
  const [data, setData] = useState(initial);
  const fs = useFullscreen();
  const [activating, startActivate] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refetch = useCallback(async () => {
    try {
      setData(await readKitchenTickets({ restaurantId, status: "pending" }));
    } catch {
      // Silencioso: Realtime / red de seguridad reintentan.
    }
  }, [restaurantId]);

  // Sin canal propio: el `StaffLiveProvider` del layout avisa cuando cambian
  // comandas o pedidos (y tras reconectar o sondear sin socket). El "en
  // vivo" ya se ve en la barra superior del panel.
  useLiveEvents(["orders", "tickets"], refetch);
  const { afterMutation } = useLiveActions();

  if (!data.kds_enabled) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-card border border-border bg-card p-8 text-center shadow-sm">
          <span className="flex size-14 items-center justify-center rounded-full border border-attention-border bg-attention-soft text-attention-soft-foreground">
            <ChefHat aria-hidden className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold text-foreground">Comandas digitales sin activar</h1>
          <p className="text-body-lg text-muted-foreground">
            Gestiona las comandas de cocina desde uno o varios dispositivos, en tiempo real.
          </p>
          {canManage ? (
            <Button
              className="min-h-12 w-full bg-money-in px-6 text-body-lg text-money-in-foreground hover:bg-money-in/90"
              disabled={activating}
              onClick={() =>
                startActivate(async () => {
                  const r = await setKdsSettings({ restaurantId, enabled: true });
                  if (!r.ok) return notify.error(r.error);
                  await refetch();
                })
              }
            >
              <Power aria-hidden className="size-5" />
              {activating ? "Activando…" : "Activar comandas digitales"}
            </Button>
          ) : (
            <p className="rounded-control border border-border bg-secondary px-3 py-2 text-body-sm text-muted-foreground">
              Pide al dueño o a un administrador que active las comandas digitales.
            </p>
          )}
        </section>
      </div>
    );
  }

  const count = countPendingTickets(data.tickets);

  async function complete(id: string) {
    const previous = data;
    setData((d) => ({ ...d, tickets: d.tickets.filter((t) => t.ticket_id !== id) }));
    const r = await completeTicket(id);
    if (!r.ok) setData(previous);
    else afterMutation();
    return r;
  }

  return (
    <>
      <StatusStrip
        className="lg:flex-col lg:items-stretch lg:gap-3 xl:flex-row xl:items-center xl:gap-6"
        status={
          <StatusPill
            tone={count > 0 ? "attention" : "money-in"}
            icon={ChefHat}
            title="Cocina"
            detail={count > 0 ? pendingLabel(count) : "Todo al día"}
          />
        }
        metrics={<KitchenMetrics tickets={data.tickets} thresholds={data.thresholds} />}
        actions={
          <>
            {canManage && (
              <KdsSettings.Trigger open={settingsOpen} onToggle={() => setSettingsOpen((v) => !v)} />
            )}
            <Button asChild variant="outline" className="min-h-12 px-4">
              <Link href="/kitchen/history">
                <History aria-hidden className="size-4" /> Historial
              </Link>
            </Button>
            {fs.supported && (
              <Button
                variant="outline"
                className="min-h-12 min-w-12 px-3"
                onClick={fs.toggle}
                aria-label={fs.active ? "Salir de pantalla completa" : "Pantalla completa"}
                title={fs.active ? "Salir de pantalla completa" : "Pantalla completa"}
              >
                {fs.active ? <Minimize2 aria-hidden className="size-5" /> : <Maximize2 aria-hidden className="size-5" />}
              </Button>
            )}
          </>
        }
      />

      {(settingsOpen || fs.error) && (
        <div className="flex flex-col gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
          {settingsOpen && canManage && (
            <KdsSettings
              restaurantId={restaurantId}
              thresholds={data.thresholds}
              onClose={() => setSettingsOpen(false)}
              onSaved={refetch}
            />
          )}
          {fs.error && <p role="alert" className="text-body-sm text-destructive">{fs.error}</p>}
        </div>
      )}

      <div className="flex-1 px-4 py-4 md:px-6">
        <OfflineBanner
          className="mb-4"
          message="Las comandas nuevas no están llegando. Aparecen solas al volver la red."
        />
        {data.tickets.length === 0 ? (
          <div className="rounded-card border border-border bg-card shadow-sm">
            <EmptyState
              icon={ChefHat}
              title="Nada por preparar"
              description="Las comandas aparecen aquí apenas el mesero o el menú digital las envían."
              action={
                <Button asChild variant="outline" className="min-h-12 px-4">
                  <Link href="/kitchen/history">
                    <History aria-hidden className="size-4" /> Ver comandas listas
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ol aria-label="Comandas por preparar, la más antigua primero" className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19.5rem),1fr))]">
            {data.tickets.map((t) => (
              <li key={t.ticket_id} className="contents">
                <KdsTicketCard
                  ticket={t}
                  thresholds={data.thresholds}
                  mode="pending"
                  action={complete}
                  onDone={() => {}}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
