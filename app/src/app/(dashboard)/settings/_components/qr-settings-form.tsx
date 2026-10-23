"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Loader2, QrCode, UserCheck } from "lucide-react";
import { ChoiceCards } from "@/components/shared/choice-card";
import { notify } from "@/lib/notifications";
import { setQrOrdersRequireApproval } from "@/lib/actions/qr-settings";
import type { RestaurantSettings } from "@/types/staff";
import { SettingsCard } from "./settings-card";

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
    <SettingsCard
      id="settings-qr"
      title="Pedidos por QR"
      help="Qué pasa con lo que piden tus clientes desde el código de la mesa. Se guarda al elegir."
      icon={QrCode}
      tone="attention"
      aside={
        isPending ? (
          <span role="status" className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…
          </span>
        ) : null
      }
    >
      <ChoiceCards<"approval" | "direct">
        label="Pedidos QR"
        columns={2}
        size="md"
        value={requireApproval ? "approval" : "direct"}
        onChange={(v) => {
          if (isPending || (v === "approval") === requireApproval) return;
          change(v === "approval");
        }}
        options={[
          {
            value: "approval",
            title: "El mesero aprueba",
            description: "Cada pedido espera en Pedidos antes de llegar a cocina.",
            icon: UserCheck,
            tone: "attention",
            disabled: isPending,
          },
          {
            value: "direct",
            title: "Directo a cocina",
            description: "Los pedidos llegan a cocina sin pasar por el mesero.",
            icon: ChefHat,
            tone: "money-in",
            disabled: isPending,
          },
        ]}
      />
    </SettingsCard>
  );
}
