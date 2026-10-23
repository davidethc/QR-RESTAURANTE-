"use client";

import { useState } from "react";
import type { CashDirection } from "@/lib/cash-movement-reasons";
import { CashFlowButton, CashFlowDialog } from "./cash-flow-dialog";

/**
 * "Meter dinero" y "Sacar dinero" como dos entradas separadas. Si hay
 * varias cajas abiertas, el movimiento va a la caja elegida (`sessionId`).
 */
export function CashFlowActions({
  session,
}: {
  session: { id: string; name: string } | null;
}) {
  const [direction, setDirection] = useState<CashDirection | null>(null);
  return (
    <>
      <CashFlowButton direction="IN" disabled={!session} onClick={() => setDirection("IN")} />
      <CashFlowButton direction="OUT" disabled={!session} onClick={() => setDirection("OUT")} />
      {session && (
        <CashFlowDialog
          direction={direction}
          cashSessionId={session.id}
          registerName={session.name}
          onOpenChange={(open) => !open && setDirection(null)}
        />
      )}
    </>
  );
}
