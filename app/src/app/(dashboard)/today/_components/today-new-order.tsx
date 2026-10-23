"use client";

import { NewOrderFlow } from "../../cash/_components/new-order/new-order-flow";
import { useChargeSheet } from "../../cash/_components/charge-sheet-host";

/** "Nuevo pedido" desde Hoy: el mismo flujo a pantalla completa de Caja. */
export function TodayNewOrder({ canCharge, billingEnabled }: { canCharge: boolean; billingEnabled: boolean }) {
  const { openCharge } = useChargeSheet();
  return (
    <NewOrderFlow
      canCharge={canCharge}
      billingEnabled={billingEnabled}
      onChargeNow={(tableSessionId, tableLabel) => openCharge({ tableSessionId, tableLabel })}
      className="min-h-16 rounded-card bg-money-in text-money-in-foreground hover:bg-money-in/90"
    />
  );
}
