"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchKitchenTickets, returnTicketToPreparation } from "@/lib/actions/kds";
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
      const r = await fetchKitchenTickets({ restaurantId, status: "completed", limit: PAGE, offset: next });
      if (!r.ok) return notify.error(r.error);
      setData(r.data);
      setOffset(next);
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
      <div className="border-b border-border bg-card px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Historial de cocina</h1>
            <p className="mt-1 text-body-lg text-muted-foreground">{data.total} comandas completadas</p>
          </div>
          <Button asChild variant="outline" className="min-h-11 px-4">
            <Link href="/kitchen"><ArrowLeft aria-hidden className="size-4" /> Volver a cocina</Link>
          </Button>
        </div>
      </div>
      <div className="flex-1 px-4 py-4 md:px-8">
        {data.tickets.length === 0 ? (
          <EmptyState icon={History} title="Sin comandas completadas" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.tickets.map((t) => (
              <KdsTicketCard
                key={t.ticket_id}
                ticket={t}
                thresholds={data.thresholds}
                mode="completed"
                action={giveBack}
                onDone={() => {}}
              />
            ))}
          </div>
        )}
        {data.total > PAGE && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" className="min-h-11 px-4" disabled={pending || offset === 0} onClick={() => load(Math.max(0, offset - PAGE))}>
              Anterior
            </Button>
            <span className="text-body-sm tabular-nums text-muted-foreground">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} de {data.total}
            </span>
            <Button variant="outline" className="min-h-11 px-4" disabled={pending || last} onClick={() => load(offset + PAGE)}>
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
