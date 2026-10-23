"use client";

import { NewOrderFlow } from "../../cash/_components/new-order/new-order-flow";
import { useChargeSheet } from "../../cash/_components/charge-sheet-host";

/**
 * "Nuevo pedido" de Pedidos: el mismo flujo a pantalla completa de Caja
 * (tipo → carta → enviar o cobrar). Los datos los trae getOrderBuilderData
 * con su propia regla de permisos; "Cobrar ahora" abre la hoja de cobro.
 */
export function NewOrderButton({
  canCharge,
  billingEnabled,
  className,
}: {
  canCharge: boolean;
  billingEnabled: boolean;
  className?: string;
}) {
  const { openCharge } = useChargeSheet();
  return (
    <NewOrderFlow
      canCharge={canCharge}
      billingEnabled={billingEnabled}
      onChargeNow={(tableSessionId, tableLabel) => openCharge({ tableSessionId, tableLabel })}
      className={className}
    />
  );
}
