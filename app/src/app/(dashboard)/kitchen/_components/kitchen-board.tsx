"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { ChefHat, History, Maximize2, Minimize2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { useLiveActions, useLiveConnected, useLiveEvents } from "@/app/(dashboard)/_components/staff-live-provider";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { completeTicket, setKdsSettings } from "@/lib/actions/kds";
import { readKitchenTickets } from "@/lib/queries/staff-client";
import { notify } from "@/lib/notifications";
import { countPendingTickets, pendingLabel, type KitchenTicketsPayload } from "@/lib/kds";
import { KdsTicketCard } from "./kds-ticket-card";
import { KdsSettings } from "./kds-settings";

/**
 * Tablero de cocina por COMANDAS (tickets), en orden de llegada. Completar
 * saca la tarjeta al instante (optimista) y sin confirmar.
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

  const refetch = useCallback(async () => {
    try {
      setData(await readKitchenTickets({ restaurantId, status: "pending" }));
    } catch {
      // Silencioso: Realtime / red de seguridad reintentan.
    }
  }, [restaurantId]);

  // Sin canal propio: el `StaffLiveProvider` del layout avisa cuando cambian
  // comandas o pedidos (y tras reconectar o sondear sin socket).
  useLiveEvents(["orders", "tickets"], refetch);
  const connected = useLiveConnected();
  const { afterMutation } = useLiveActions();

  if (!data.kds_enabled) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <ChefHat aria-hidden className="size-12 text-primary" strokeWidth={1.5} />
          <h1 className="text-2xl font-semibold text-foreground">Comandas digitales sin activar</h1>
          <p className="text-body-lg text-muted-foreground">
            Comandas digitales: gestiona las comandas de cocina desde uno o varios dispositivos en tiempo real.
          </p>
          {canManage ? (
            <Button
              className="min-h-11 px-6 text-body-lg"
              disabled={activating}
              onClick={() =>
                startActivate(async () => {
                  const r = await setKdsSettings({ restaurantId, enabled: true });
                  if (!r.ok) return notify.error(r.error);
                  await refetch();
                })
              }
            >
              {activating ? "Activando…" : "Activar"}
            </Button>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Pide al dueño o a un administrador que active las comandas digitales.
            </p>
          )}
        </div>
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
      <div className="border-b border-border bg-card px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-foreground">Cocina</h1>
            <p aria-live="polite" className="mt-1 flex items-center gap-2 text-body-lg text-muted-foreground">
              <Clock aria-hidden className="size-4" strokeWidth={1.75} />
              {pendingLabel(count)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <KdsSettings restaurantId={restaurantId} thresholds={data.thresholds} onSaved={refetch} />
            )}
            <Button asChild variant="outline" className="min-h-11 px-4">
              <Link href="/kitchen/history">
                <History aria-hidden className="size-4" /> Ver historial
              </Link>
            </Button>
            {fs.supported && (
              <Button variant="outline" className="min-h-11 px-4" onClick={fs.toggle}>
                {fs.active ? (
                  <><Minimize2 aria-hidden className="size-4" /> Salir de pantalla completa</>
                ) : (
                  <><Maximize2 aria-hidden className="size-4" /> Pantalla completa</>
                )}
              </Button>
            )}
            <ConnectionStatus connected={connected} />
          </div>
        </div>
        {fs.error && <p role="alert" className="mt-3 text-body-sm text-destructive">{fs.error}</p>}
        <OfflineBanner
          className="mt-4"
          message="Las comandas nuevas no están llegando. Aparecen solas al volver la red."
        />
      </div>

      <div className="flex-1 px-4 py-4 md:px-8">
        {data.tickets.length === 0 ? (
          <EmptyState
            icon={ChefHat}
            title="Nada por preparar"
            description="Las comandas aparecen aquí apenas el mesero las envía."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.tickets.map((t) => (
              <KdsTicketCard
                key={t.ticket_id}
                ticket={t}
                thresholds={data.thresholds}
                mode="pending"
                action={complete}
                onDone={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
