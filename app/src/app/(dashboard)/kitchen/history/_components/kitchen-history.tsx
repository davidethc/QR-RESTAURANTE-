"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusMetric, StatusPill, StatusStrip } from "@/components/shared/status-strip";
import { returnTicketToPreparation } from "@/lib/actions/kds";
import { readKitchenTickets } from "@/lib/queries/staff-client";
import { notify } from "@/lib/notifications";
import type { KitchenTicketsPayload } from "@/lib/kds";
import { KdsTicketCard } from "../../_components/kds-ticket-card";

const PAGE = 20;

export function KitchenHistory({
  restaurantId,
  initial,
}: {
  restaurantId: string;
  initial: KitchenTicketsPayload;
}) {
  const [data, setData] = useState(initial);
  const [offset, setOffset] = useState(0);
  const [pending, start] = useTransition();

  function load(next: number) {
    start(async () => {
      try {
        setData(await readKitchenTickets({ restaurantId, status: "completed", limit: PAGE, offset: next }));
        setOffset(next);
      } catch {
        notify.error("No se pudo cargar el historial. Intenta de nuevo.");
      }
    });
  }

  async function giveBack(id: string) {
    const r = await returnTicketToPreparation(id);
    if (r.ok) load(offset);
    return r;
  }

  const last = offset + PAGE >= data.total;

  return (
    <>
      <StatusStrip
        status={<StatusPill tone="money-in" icon={History} title="Historial de cocina" detail="Comandas listas, la más reciente primero" />}
        metrics={<StatusMetric label="Comandas listas" value={String(data.total)} tone={data.total > 0 ? "money-in" : "neutral"} icon={History} />}
        actions={
          <Button asChild variant="outline" className="min-h-12 px-4">
            <Link href="/kitchen"><ArrowLeft aria-hidden className="size-4" /> Volver a cocina</Link>
          </Button>
        }
      />
      <div className="flex-1 px-4 py-4 md:px-6">
        {data.tickets.length === 0 ? (
          <div className="rounded-card border border-border bg-card shadow-sm">
            <EmptyState
              icon={History}
              title="Sin comandas listas"
              description="Aquí aparecen las comandas que cocina marca como listas."
              action={
                <Button asChild variant="outline" className="min-h-12 px-4">
                  <Link href="/kitchen"><ArrowLeft aria-hidden className="size-4" /> Volver a cocina</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ol aria-label="Comandas listas" className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19.5rem),1fr))]">
            {data.tickets.map((t) => (
              <li key={t.ticket_id} className="contents">
                <KdsTicketCard
                  ticket={t}
                  thresholds={data.thresholds}
                  mode="completed"
                  action={giveBack}
                  onDone={() => {}}
                />
              </li>
            ))}
          </ol>
        )}
        {data.total > PAGE && (
          <nav aria-label="Páginas del historial" className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" className="min-h-12 px-4" disabled={pending || offset === 0} onClick={() => load(Math.max(0, offset - PAGE))}>
              <ChevronLeft aria-hidden className="size-4" /> Anterior
            </Button>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-body-sm tabular-nums text-muted-foreground">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} de {data.total}
            </span>
            <Button variant="outline" className="min-h-12 px-4" disabled={pending || last} onClick={() => load(offset + PAGE)}>
              Siguiente <ChevronRight aria-hidden className="size-4" />
            </Button>
          </nav>
        )}
      </div>
    </>
  );
}
