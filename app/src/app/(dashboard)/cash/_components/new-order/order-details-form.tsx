"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { posPressable } from "@/components/shared/pos-tone";
import { DELIVERY_PROVIDERS, PROVIDER_LABEL, type CounterFormValues, type FieldErrors } from "@/lib/counter-order";
import { cn } from "@/lib/utils";

/**
 * Datos del cliente según el tipo (mismas reglas que validateCounterForm y la
 * RPC): para llevar, nombre opcional; domicilio propio, nombre, teléfono y
 * dirección; plataforma, el ID del pedido de la app.
 */
export function OrderDetailsForm({
  kind,
  form,
  errors,
  onChange,
}: {
  kind: "takeaway" | "delivery";
  form: CounterFormValues;
  errors: FieldErrors;
  onChange: <K extends keyof CounterFormValues>(key: K, value: CounterFormValues[K]) => void;
}) {
  const own = form.provider === "own";
  const platform = form.provider !== "" && !own;

  return (
    <section aria-label="Datos del pedido" className="mb-5 flex flex-col gap-3">
      {kind === "takeaway" && (
        <Field id="ob-name" label="Nombre del cliente (opcional)" value={form.customerName} onChange={(v) => onChange("customerName", v)} error={errors.customer_name} maxLength={80} placeholder="Ej: Ana" />
      )}

      {kind === "delivery" && (
        <>
          <div>
            <p className="mb-2 text-body-sm font-semibold text-foreground">¿Quién entrega?</p>
            <div role="radiogroup" aria-label="Servicio de entrega" className="grid grid-cols-2 gap-2">
              {DELIVERY_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={form.provider === p}
                  onClick={() => onChange("provider", p)}
                  className={cn(
                    posPressable,
                    "min-h-12 rounded-control border-2 px-3 text-body-sm font-semibold",
                    form.provider === p ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground",
                    errors.delivery_provider && "border-money-out-border"
                  )}
                >
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>
            {errors.delivery_provider && <Msg text={errors.delivery_provider} />}
          </div>

          {platform && (
            <Field id="ob-ext" label="ID del pedido en la plataforma" value={form.externalOrderId} onChange={(v) => onChange("externalOrderId", v)} error={errors.external_order_id} maxLength={60} />
          )}

          {own && (
            <div className="grid gap-3">
              <Field id="ob-dname" label="Nombre" value={form.customerName} onChange={(v) => onChange("customerName", v)} error={errors.customer_name} maxLength={80} />
              <Field id="ob-phone" label="Teléfono" inputMode="tel" value={form.customerPhone} onChange={(v) => onChange("customerPhone", v)} error={errors.customer_phone} maxLength={20} placeholder="+593 99 123 4567" />
              <Field id="ob-calle" label="Calle" value={form.calle} onChange={(v) => onChange("calle", v)} error={errors["delivery_address.calle"]} />
              <div className="grid grid-cols-2 gap-3">
                <Field id="ob-num" label="Número" value={form.numero} onChange={(v) => onChange("numero", v)} error={errors["delivery_address.numero"]} />
                <Field id="ob-colonia" label="Barrio / sector" value={form.colonia} onChange={(v) => onChange("colonia", v)} error={errors["delivery_address.colonia"]} />
              </div>
              <Field id="ob-ref" label="Referencias (opcional)" value={form.referencias} onChange={(v) => onChange("referencias", v)} error={errors["delivery_address.referencias"]} />
              <Field id="ob-ship" label="Costo de envío (vacío = por cotizar)" inputMode="decimal" value={form.shippingCost} onChange={(v) => onChange("shippingCost", v)} error={errors.shipping_cost} placeholder="Por cotizar" />
            </div>
          )}
        </>
      )}

      <Field id="ob-comment" label="Comentario para cocina (opcional)" value={form.generalComment} onChange={(v) => onChange("generalComment", v)} error={errors.general_comment} maxLength={300} />
    </section>
  );
}

function Msg({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-1.5 text-body-sm font-medium text-money-out-soft-foreground">
      {text}
    </p>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
} & Omit<React.ComponentProps<"input">, "onChange" | "value" | "id">) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-body-sm font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className="h-12 text-body"
        {...rest}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-body-sm font-medium text-money-out-soft-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
