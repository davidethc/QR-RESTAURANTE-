"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { updateBillingSettings } from "@/lib/actions/restaurant";
import { billingSettingsSchema } from "@/lib/validations/restaurant";
import type { RestaurantSettings } from "@/types/staff";

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
    <form onSubmit={handleSubmit} noValidate className="max-w-lg">
      <FieldGroup>
        <Field orientation="horizontal">
          <Switch
            id="billing-enabled"
            checked={billingEnabled}
            onCheckedChange={setBillingEnabled}
          />
          <div>
            <FieldLabel htmlFor="billing-enabled">Cobrar desde Monky</FieldLabel>
            <FieldDescription>
              Activa la pantalla de Caja: abrir turno, cobrar cuentas e imprimir tickets.
            </FieldDescription>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="max-discount">Descuento máximo del mesero (%)</FieldLabel>
          <Input
            id="max-discount"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={maxDiscount}
            onChange={(e) => setMaxDiscount(e.target.value)}
            className="w-32"
          />
          <FieldDescription>0 = solo tú o un administrador pueden hacer descuentos.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="day-cutoff">El día termina a las</FieldLabel>
          <Input
            id="day-cutoff"
            type="time"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            className="w-32"
          />
          <FieldDescription>
            Lo vendido antes de esta hora cuenta para el día anterior (útil si cierras
            después de medianoche).
          </FieldDescription>
        </Field>

        {error && (
          <p role="alert" className="text-meta text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending && <Loader2 className="animate-spin" />}
          Guardar cobro
        </Button>
      </FieldGroup>
    </form>
  );
}
