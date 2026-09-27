"use client";

import { useState } from "react";
import { OpenCashCard } from "./open-cash-card";
import { CashSessionPanel } from "./cash-session-panel";
import { CashCloseResultCard } from "./cash-close-result-card";
import type { CashRegisterOption } from "@/lib/queries/cash";
import type { UserRole } from "@/config/constants";
import type { CashSessionSummary } from "@/types/billing";

/**
 * Envuelve el estado de la caja (abierta o cerrada) en un client component
 * para poder mostrar la tarjeta de resultado del último cierre (bug P1 de
 * QA 2026-09-26) por encima de "Abrir caja" sin perderla cuando el server
 * component (page.tsx) vuelve a renderizar tras `router.refresh()`.
 */
export function CashSessionArea({
  summary,
  registers,
  role,
  timeZone,
}: {
  summary: CashSessionSummary | null;
  registers: CashRegisterOption[];
  role: UserRole;
  timeZone: string;
}) {
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const [closeResult, setCloseResult] = useState<CashSessionSummary | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && closeResult && (
        <CashCloseResultCard result={closeResult} onDismiss={() => setCloseResult(null)} />
      )}
      {summary ? (
        <CashSessionPanel
          summary={summary}
          role={role}
          timeZone={timeZone}
          onClosed={isAdmin ? setCloseResult : undefined}
        />
      ) : (
        <OpenCashCard registers={registers} />
      )}
    </div>
  );
}
