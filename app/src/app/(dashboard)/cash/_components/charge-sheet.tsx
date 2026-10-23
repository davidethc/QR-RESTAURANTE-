"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CheckoutPanel } from "./checkout/checkout-panel";

/**
 * Hoja de cobro para Mesas, Pedidos y Caja en teléfono: el mismo cobro por
 * pasos de /cash (CheckoutPanel) dentro de una hoja a pantalla completa en
 * móvil y lateral ancha en tablet. Hay una sola instancia en todo el panel
 * (ver charge-sheet-host.tsx) para que ninguna lista la desmonte a mitad de
 * cobro cuando el tiempo real la refresca.
 */
export function ChargeSheet({
  tableSessionId,
  tableLabel,
  canManage,
  open,
  onOpenChange,
  onSettled,
}: {
  tableSessionId: string;
  tableLabel: string;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:xl:max-w-3xl"
      >
        <SheetTitle className="sr-only">Cobrar · {tableLabel}</SheetTitle>
        <SheetDescription className="sr-only">Cobro por pasos: cuenta, cómo pagan, método y listo.</SheetDescription>
        {open && (
          <CheckoutPanel
            key={tableSessionId}
            tableSessionId={tableSessionId}
            fallbackLabel={tableLabel}
            canManage={canManage}
            onSettled={onSettled}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
