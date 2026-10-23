"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleOff, Loader2, Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toneSoft } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { updateBillingSettings } from "@/lib/actions/restaurant";
import { billingSettingsSchema } from "@/lib/validations/restaurant";
import type { RestaurantSettings } from "@/types/staff";
import { SettingRow, SettingsCard } from "./settings-card";

/** Cobro y caja. Solo se muestra al dueño (la base también lo exige). */
export function BillingSettingsForm({ restaurant }: { restaurant: RestaurantSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [billingEnabled, setBillingEnabled] = useState(restaurant.billing_enabled);
  const [maxDiscount, setMaxDiscount] = useState(String(restaurant.max_waiter_discount_pct));
  const [cutoff, setCutoff] = useState(restaurant.business_day_cutoff.slice(0, 5));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = billingSettingsSchema.safeParse({
      billingEnabled,
      maxWaiterDiscountPct: maxDiscount,
      businessDayCutoff: cutoff,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBillingSettings(restaurant.id, parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify.success("Cobro actualizado");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <SettingsCard
        id="settings-billing"
        title="Cobro y caja"
        help="Solo lo ve el dueño. Controla cómo se cobra en el local."
        icon={Wallet}
        tone="money-in"
        aside={
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-semibold",
              billingEnabled ? toneSoft["money-in"] : toneSoft.neutral
            )}
          >
            {billingEnabled ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleOff className="size-3.5" aria-hidden />}
            {billingEnabled ? "Cobro activo" : "Cobro apagado"}
          </span>
        }
        footer={
          <Button type="submit" disabled={isPending} className="min-h-11">
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar cobro
          </Button>
        }
      >
        <div className="flex flex-col divide-y divide-border rounded-control border border-border">
          <div className="p-3">
            <SettingRow
              title="Cobrar desde Monky"
              htmlFor="billing-enabled"
              help="Activa la pantalla de Caja: abrir turno, cobrar cuentas e imprimir tickets."
            >
              <Switch id="billing-enabled" checked={billingEnabled} onCheckedChange={setBillingEnabled} />
            </SettingRow>
          </div>
          <div className="p-3">
            <SettingRow
              title="Descuento máximo del mesero"
              htmlFor="max-discount"
              help="0 = solo tú o un administrador pueden hacer descuentos."
            >
              <Input
                id="max-discount"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
                className="min-h-11 w-24 text-right tabular-nums"
              />
              <span className="text-body-sm text-muted-foreground">%</span>
            </SettingRow>
          </div>
          <div className="p-3">
            <SettingRow
              title="El día termina a las"
              htmlFor="day-cutoff"
              help="Lo vendido antes de esta hora cuenta para el día anterior (útil si cierras después de medianoche)."
            >
              <Input
                id="day-cutoff"
                type="time"
                value={cutoff}
                onChange={(e) => setCutoff(e.target.value)}
                className="min-h-11 w-32"
              />
            </SettingRow>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-meta text-destructive">
            {error}
          </p>
        )}
      </SettingsCard>
    </form>
  );
}
