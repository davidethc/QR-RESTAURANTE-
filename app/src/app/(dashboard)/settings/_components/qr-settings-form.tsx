"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { setQrOrdersRequireApproval } from "@/lib/actions/qr-settings";
import type { RestaurantSettings } from "@/types/staff";

/** Pedidos que el cliente hace desde el QR de la mesa. Se guarda al cambiar. */
export function QrSettingsForm({ restaurant }: { restaurant: RestaurantSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requireApproval, setRequireApproval] = useState(restaurant.qr_orders_require_approval);

  function change(next: boolean) {
    const previous = requireApproval;
    setRequireApproval(next);
    startTransition(async () => {
      const result = await setQrOrdersRequireApproval(restaurant.id, next);
      if (!result.ok) {
        setRequireApproval(previous);
        notify.error(result.error);
        return;
      }
      notify.success(next ? "Los pedidos QR esperarán aprobación" : "Los pedidos QR pasan directo a cocina");
      router.refresh();
    });
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[240px_1fr] lg:gap-12">
      <div>
        <h2 className="text-body font-semibold text-foreground">Pedidos por QR</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Lo que piden tus clientes desde el código de la mesa.
        </p>
      </div>
      <FieldGroup className="max-w-lg">
        <Field orientation="horizontal">
          <Switch
            id="qr-require-approval"
            checked={requireApproval}
            disabled={isPending}
            onCheckedChange={change}
          />
          <div>
            <FieldLabel htmlFor="qr-require-approval">Pedidos QR requieren aprobación</FieldLabel>
            <FieldDescription>
              {requireApproval
                ? "El mesero aprueba cada pedido antes de que llegue a cocina."
                : "Los pedidos llegan directo a cocina, sin pasar por el mesero."}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>
    </section>
  );
}
