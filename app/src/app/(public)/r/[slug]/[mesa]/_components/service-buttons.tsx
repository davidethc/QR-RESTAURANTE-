"use client";

import { Bell, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/lib/notifications";
import { callWaiter } from "@/lib/actions/waiter-calls";

export function ServiceButtons({ tableNumber }: { tableNumber: number }) {
  return (
    <div className="flex gap-2">
      <ConfirmDialog
        trigger={
          <Button variant="outline" className="h-11 flex-1 rounded-xl text-[14px]">
            <Bell /> Llamar mesero
          </Button>
        }
        title="¿Llamar al mesero?"
        description={`Un mesero irá a la Mesa ${tableNumber}.`}
        confirmLabel="Llamar"
        action={() => callWaiter("WAITER")}
        onSuccess={() => notify.callAcknowledged()}
      />
      <ConfirmDialog
        trigger={
          <Button variant="outline" className="h-11 flex-1 rounded-xl text-[14px]">
            <Receipt /> Pedir cuenta
          </Button>
        }
        title="¿Solicitar la cuenta?"
        description={`El mesero llevará la cuenta a la Mesa ${tableNumber}.`}
        confirmLabel="Solicitar"
        action={() => callWaiter("BILL")}
        onSuccess={() => notify.callAcknowledged()}
      />
    </div>
  );
}
