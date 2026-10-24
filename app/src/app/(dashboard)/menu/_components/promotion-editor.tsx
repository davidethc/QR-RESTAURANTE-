"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Check,
  FolderTree,
  Gift,
  LayoutGrid,
  Loader2,
  Pause,
  Percent,
  Play,
  Search,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ChoiceCards } from "@/components/shared/choice-card";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { QuantityStepper } from "@/components/shared/quantity-stepper";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { notify } from "@/lib/notifications";
import { savePromotion } from "@/lib/actions/promotions";
import {
  WEEKDAYS,
  activationSummary,
  promoLineDiscount,
  promotionFormSchema,
  promotionLabel,
  promotionToForm,
  weekdaysSummary,
  type PromotionForm,
} from "@/lib/promotions";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import type { AdminCategory, AdminProduct } from "@/types/staff";
import type { Promotion, PromotionServiceOptions } from "@/types/promotions";
import { PromoChip, PromoPrice } from "../../cash/_components/checkout/promo-line";

type StepId = "tipo" | "productos" | "cuando" | "canales";
const STEPS: { id: StepId; label: string }[] = [
  { id: "tipo", label: "Tipo" },
  { id: "productos", label: "Productos" },
  { id: "cuando", label: "Cuándo" },
  { id: "canales", label: "Canales" },
];
const FIELD_STEP: Record<string, StepId> = {
  name: "tipo",
  type: "tipo",
  value_type: "tipo",
  value: "tipo",
  receive_qty: "tipo",
  buy_qty: "tipo",
  applies_to: "productos",
  target_ids: "productos",
  activation: "cuando",
  weekdays: "cuando",
  starts_on: "cuando",
  ends_on: "cuando",
  service_options: "canales",
  status: "canales",
};
const NAME_EXAMPLES = ["Promo de fin de semana", "Descuento especial", "2x1 de los jueves"];

const ALL_CHANNELS: PromotionServiceOptions = {
  pos: { tables: true, dine_in_no_table: true, takeaway: true, delivery: true },
  digital_menu: { tables: true, pickup: true, delivery: true },
};
const POS_CHANNELS = [
  ["tables", "Mesas"],
  ["dine_in_no_table", "En el local"],
  ["takeaway", "Para llevar"],
  ["delivery", "Domicilio"],
] as const;
const DIGITAL_CHANNELS = [
  ["tables", "Mesas (QR)"],
  ["pickup", "Recoger"],
  ["delivery", "Domicilio"],
] as const;

interface Draft {
  name: string;
  type: PromotionForm["type"] | null;
  value_type: "percent" | "fixed";
  value: string;
  receive_qty: number;
  buy_qty: number;
  applies_to: PromotionForm["applies_to"];
  target_ids: string[];
  activation: PromotionForm["activation"];
  weekdays: number[];
  starts_on: string;
  ends_on: string;
  service_options: PromotionServiceOptions;
  status: PromotionForm["status"];
}

function emptyDraft(): Draft {
  return {
    name: "",
    type: null,
    value_type: "percent",
    value: "",
    receive_qty: 2,
    buy_qty: 1,
    applies_to: "products",
    target_ids: [],
    activation: "weekdays",
    weekdays: [],
    starts_on: "",
    ends_on: "",
    service_options: ALL_CHANNELS,
    status: "active",
  };
}

function draftOf(p: Promotion): Draft {
  const f = promotionToForm(p);
  return {
    name: f.name,
    type: f.type,
    value_type: f.value_type ?? "percent",
    value: f.value == null ? "" : String(f.value),
    receive_qty: f.receive_qty ?? 2,
    buy_qty: f.buy_qty ?? 1,
    applies_to: f.applies_to,
    target_ids: f.target_ids,
    activation: f.activation,
    weekdays: f.weekdays,
    starts_on: f.starts_on ?? "",
    ends_on: f.ends_on ?? "",
    service_options: f.service_options,
    status: f.status,
  };
}

function toForm(d: Draft): unknown {
  const value = d.value.trim() === "" ? null : Number(d.value.replace(",", "."));
  return {
    name: d.name,
    type: d.type ?? undefined,
    value_type: d.type === "discount" ? d.value_type : null,
    value: d.type === "discount" ? value : null,
    receive_qty: d.type === "buy_x_get_y" ? d.receive_qty : null,
    buy_qty: d.type === "buy_x_get_y" ? d.buy_qty : null,
    applies_to: d.applies_to,
    target_ids: d.target_ids,
    activation: d.type === "buy_x_get_y" ? "weekdays" : d.activation,
    weekdays: d.weekdays,
    starts_on: d.starts_on || null,
    ends_on: d.ends_on || null,
    service_options: d.service_options,
    status: d.status,
  };
}

/**
 * Promotion editor as a full panel in four steps (Tipo → Productos → Cuándo →
 * Canales), the same shape as the product editor. Steps stay mounted; the
 * "discard changes?" confirmation is inline, nothing opens over the panel.
 * The server re-validates everything (save_promotion).
 */
export function PromotionEditor({
  restaurantId,
  categories,
  products,
  promotion,
  today,
  trigger,
}: {
  restaurantId: string;
  categories: AdminCategory[];
  products: AdminProduct[];
  promotion?: Promotion;
  /** Restaurant local date (YYYY-MM-DD): past days are disabled. */
  today: string;
  trigger: ReactNode;
}) {
  const isEdit = !!promotion;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepId>("tipo");
  const [draft, setDraft] = useState<Draft>(() => (promotion ? draftOf(promotion) : emptyDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isLastStep = stepIndex === STEPS.length - 1;
  const errorSteps = new Set(Object.keys(errors).map((k) => FIELD_STEP[k.split(".")[0]] ?? "tipo"));

  function patch(next: Partial<Draft>) {
    setDirty(true);
    setDraft((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const copy = { ...e };
      for (const k of Object.keys(next)) delete copy[k];
      if ("type" in next || "activation" in next) delete copy.activation;
      return copy;
    });
  }

  function requestOpenChange(next: boolean) {
    if (!next && dirty && !isPending) return setConfirmClose(true);
    setConfirmClose(false);
    if (next) {
      setStep("tipo");
      setDraft(promotion ? draftOf(promotion) : emptyDraft());
      setErrors({});
      setRootError(null);
      setDirty(false);
      setSearch("");
    }
    setOpen(next);
  }

  function goTo(id: StepId) {
    setConfirmClose(false);
    setStep(id);
  }

  function validate() {
    const parsed = promotionFormSchema.safeParse(toForm(draft));
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "name");
      if (!next[key]) next[key] = issue.message;
    }
    if (!draft.type) next.type = "Elige el tipo de promoción";
    setErrors(next);
    const first = STEPS.find((s) => Object.keys(next).some((k) => (FIELD_STEP[k] ?? "tipo") === s.id));
    if (first) setStep(first.id);
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && !isLastStep) return goTo(STEPS[stepIndex + 1].id);
    if (isPending || submittingRef.current) return;
    setRootError(null);
    const form = validate();
    if (!form) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        const result = await savePromotion(restaurantId, form, promotion?.id ?? null);
        if (!result.ok) {
          if (result.field && FIELD_STEP[result.field.split(".")[0]]) {
            const key = result.field.split(".")[0];
            setErrors({ [key]: result.error });
            setStep(FIELD_STEP[key]);
          } else {
            setRootError(result.error);
          }
          return;
        }
        notify.success(isEdit ? "Promoción actualizada" : "Promoción creada");
        setDirty(false);
        setOpen(false);
        router.refresh();
      } finally {
        submittingRef.current = false;
      }
    });
  }

  const label =
    draft.type === "buy_x_get_y"
      ? promotionLabel({ type: "buy_x_get_y", value_type: null, value: null, receive_qty: draft.receive_qty, buy_qty: draft.buy_qty })
      : draft.type === "discount" && Number(draft.value) > 0
        ? promotionLabel({ type: "discount", value_type: draft.value_type, value: Number(draft.value), receive_qty: null, buy_qty: null })
        : null;

  const affected = useMemo(() => {
    const set = new Set(draft.target_ids);
    return draft.applies_to === "products"
      ? products.filter((p) => set.has(p.id))
      : products.filter((p) => p.category_id && set.has(p.category_id));
  }, [draft.applies_to, draft.target_ids, products]);

  const daysText = weekdaysSummary(draft.weekdays);
  const noChannel =
    Object.values(draft.service_options.pos).every((v) => !v) &&
    Object.values(draft.service_options.digital_menu).every((v) => !v);

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:lg:max-w-[70rem]"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Tag className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-body font-semibold leading-tight text-foreground">
              {isEdit ? `Editar ${promotion.name}` : "Nueva promoción"}
            </SheetTitle>
            <SheetDescription className="text-meta leading-tight text-muted-foreground">
              {isEdit ? "Cambia lo que necesites y guarda." : "Completa los pasos; se aplica sola a los pedidos nuevos."}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => requestOpenChange(false)}
            aria-label="Cerrar editor"
            className={cn(posPressable, "flex min-h-12 min-w-12 items-center justify-center rounded-button text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            <X className="size-5" aria-hidden />
          </button>
          <StepTabs current={step} onSelect={goTo} errorSteps={errorSteps} />
        </header>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-4">
              {/* Paso 1 — Tipo */}
              <div hidden={step !== "tipo"} className="flex flex-col gap-4">
                <Panel title="¿Qué tipo de promoción?" description="Puedes cambiarlo mientras no guardes.">
                  <ChoiceCards
                    label="Tipo de promoción"
                    columns={2}
                    value={draft.type}
                    onChange={(type) => patch({ type, ...(type === "buy_x_get_y" ? { activation: "weekdays" as const } : {}) })}
                    options={[
                      {
                        value: "discount",
                        title: "Descuento en productos",
                        description: "Un porcentaje o un monto menos en productos o categorías.",
                        icon: Percent,
                        tone: "attention",
                      },
                      {
                        value: "buy_x_get_y",
                        title: "Compra X y lleva Y",
                        description: "Estilo 2x1 o 3x2: se llevan más unidades de las que pagan.",
                        icon: Gift,
                        tone: "info",
                      },
                    ]}
                  />
                  {errors.type && <FieldError>{errors.type}</FieldError>}
                </Panel>

                <Panel title="Nombre" description="Lo ve tu equipo en la lista de promociones.">
                  <Field data-invalid={!!errors.name}>
                    <FieldLabel htmlFor="promo-name">Nombre de la promoción</FieldLabel>
                    <Input
                      id="promo-name"
                      className="min-h-12"
                      maxLength={80}
                      placeholder={`Ej. ${NAME_EXAMPLES[0]}`}
                      value={draft.name}
                      aria-invalid={!!errors.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                    {errors.name && <FieldError>{errors.name}</FieldError>}
                  </Field>
                  {!draft.name && (
                    <div className="flex flex-wrap gap-2" aria-label="Ejemplos de nombre">
                      {NAME_EXAMPLES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => patch({ name: n })}
                          className={cn(posPressable, "min-h-12 rounded-button border-2 border-dashed border-border-strong px-4 text-body-sm font-semibold text-muted-foreground hover:border-foreground hover:text-foreground")}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>

                {draft.type === "discount" && (
                  <Panel title="Valor del descuento" description="Se descuenta por unidad, sobre el precio del producto (las personalizaciones no se descuentan).">
                    <SegmentedControl<"percent" | "fixed">
                      aria-label="Tipo de valor"
                      value={draft.value_type}
                      onValueChange={(value_type) => patch({ value_type })}
                      className="[&>button]:h-12 [&>button]:px-4"
                      options={[
                        { value: "percent", label: "Porcentaje (%)" },
                        { value: "fixed", label: "Monto fijo ($)" },
                      ]}
                    />
                    <Field data-invalid={!!errors.value}>
                      <FieldLabel htmlFor="promo-value">{draft.value_type === "percent" ? "Porcentaje" : "Monto por unidad"}</FieldLabel>
                      <div className="relative max-w-56">
                        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body font-semibold text-muted-foreground">
                          {draft.value_type === "percent" ? "%" : "$"}
                        </span>
                        <Input
                          id="promo-value"
                          inputMode="decimal"
                          className="min-h-12 pl-8 text-lead tabular-nums"
                          placeholder={draft.value_type === "percent" ? "10" : "1.50"}
                          value={draft.value}
                          aria-invalid={!!errors.value}
                          onChange={(e) => patch({ value: e.target.value })}
                        />
                      </div>
                      {errors.value && <FieldError>{errors.value}</FieldError>}
                    </Field>
                  </Panel>
                )}

                {draft.type === "buy_x_get_y" && (
                  <Panel title="Cantidades" description="De cada grupo de unidades que se lleva el cliente, paga solo algunas.">
                    <div className="flex flex-wrap gap-2" aria-label="Atajos">
                      {[
                        [2, 1],
                        [3, 2],
                        [4, 3],
                      ].map(([x, y]) => (
                        <PickChip key={`${x}x${y}`} checked={draft.receive_qty === x && draft.buy_qty === y} onClick={() => patch({ receive_qty: x, buy_qty: y })}>
                          {x}x{y}
                        </PickChip>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field data-invalid={!!errors.receive_qty}>
                        <FieldLabel>Se lleva</FieldLabel>
                        <QuantityStepper
                          label="Unidades que se lleva"
                          min={2}
                          value={draft.receive_qty}
                          onChange={(q) => {
                            const x = Math.min(99, Math.max(2, q));
                            patch({ receive_qty: x, buy_qty: Math.min(draft.buy_qty, x - 1) });
                          }}
                        />
                        {errors.receive_qty && <FieldError>{errors.receive_qty}</FieldError>}
                      </Field>
                      <Field data-invalid={!!errors.buy_qty}>
                        <FieldLabel>Paga</FieldLabel>
                        <QuantityStepper
                          label="Unidades que paga"
                          min={1}
                          value={draft.buy_qty}
                          onChange={(q) => patch({ buy_qty: Math.min(draft.receive_qty - 1, Math.max(1, q)) })}
                        />
                        {errors.buy_qty && <FieldError>{errors.buy_qty}</FieldError>}
                      </Field>
                    </div>
                    <p className="text-body-sm text-muted-foreground">
                      Lleva {draft.receive_qty}, paga {draft.buy_qty}: {draft.receive_qty - draft.buy_qty === 1 ? "1 unidad gratis" : `${draft.receive_qty - draft.buy_qty} unidades gratis`} por cada {draft.receive_qty}.
                    </p>
                  </Panel>
                )}
              </div>

              {/* Paso 2 — Productos */}
              <div hidden={step !== "productos"} className="flex flex-col gap-4">
                <Panel title="Se aplica a" description="Elige productos sueltos o categorías completas.">
                  <SegmentedControl<"products" | "categories">
                    aria-label="Se aplica a"
                    value={draft.applies_to}
                    onValueChange={(applies_to) => patch({ applies_to, target_ids: [] })}
                    className="[&>button]:h-12 [&>button]:px-4"
                    options={[
                      { value: "products", label: "Productos", icon: LayoutGrid },
                      { value: "categories", label: "Categorías", icon: FolderTree },
                    ]}
                  />
                  {errors.target_ids && (
                    <p role="alert" className="flex items-center gap-2 text-body-sm font-medium text-money-out-soft-foreground">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden /> {errors.target_ids}
                    </p>
                  )}
                  {draft.applies_to === "products" ? (
                    <ProductPicker
                      categories={categories}
                      products={products}
                      search={search}
                      onSearch={setSearch}
                      selected={draft.target_ids}
                      onChange={(target_ids) => patch({ target_ids })}
                    />
                  ) : (
                    <div role="group" aria-label="Categorías" className="flex flex-wrap gap-2">
                      {categories.length === 0 && <p className="text-body-sm text-muted-foreground">Todavía no hay categorías.</p>}
                      {categories.map((c) => (
                        <PickChip key={c.id} checked={draft.target_ids.includes(c.id)} onClick={() => patch({ target_ids: toggle(draft.target_ids, c.id) })}>
                          {c.name} <span className="font-normal opacity-70">· {c.product_count}</span>
                        </PickChip>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              {/* Paso 3 — Cuándo */}
              <div hidden={step !== "cuando"} className="flex flex-col gap-4">
                <Panel title="¿Cuándo se activa?" description="Se evalúa con la hora de tu local, de 00:00 a 23:59.">
                  {draft.type !== "buy_x_get_y" ? (
                    <SegmentedControl<"weekdays" | "dates">
                      aria-label="Forma de activación"
                      value={draft.activation}
                      onValueChange={(activation) => patch({ activation })}
                      className="[&>button]:h-12 [&>button]:px-4"
                      options={[
                        { value: "weekdays", label: "Días de la semana", icon: CalendarDays },
                        { value: "dates", label: "Rango de fechas", icon: CalendarRange },
                      ]}
                    />
                  ) : (
                    <p className={cn("flex items-center gap-2 rounded-control border px-3 py-2 text-body-sm font-medium", toneSoft.info)}>
                      <CalendarDays className="size-4 shrink-0" aria-hidden /> Compra X lleva Y se activa por días de la semana.
                    </p>
                  )}
                  {errors.activation && <FieldError>{errors.activation}</FieldError>}

                  {draft.activation === "weekdays" || draft.type === "buy_x_get_y" ? (
                    <div className="flex flex-col gap-3">
                      <p id="promo-days" className="text-body-sm font-semibold text-foreground">Toca los días en que se aplica</p>
                      <div role="group" aria-labelledby="promo-days" className="grid grid-cols-4 gap-2 md:grid-cols-7">
                        {WEEKDAYS.map((d) => (
                          <PickChip key={d.value} checked={draft.weekdays.includes(d.value)} onClick={() => patch({ weekdays: toggle(draft.weekdays, d.value) })} ariaLabel={d.name} compact>
                            {d.short}
                          </PickChip>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => patch({ weekdays: draft.weekdays.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6] })}
                          className={cn(posPressable, "min-h-12 rounded-button px-3 text-body-sm font-semibold text-foreground underline-offset-4 hover:underline")}
                        >
                          {draft.weekdays.length === 7 ? "Quitar todos" : "Todos los días"}
                        </button>
                      </div>
                      <p
                        role="status"
                        className={cn(
                          "flex items-center gap-2 rounded-control border px-3 py-2 text-body-sm font-medium",
                          daysText ? toneSoft["money-in"] : toneSoft.neutral
                        )}
                      >
                        <CalendarDays className="size-4 shrink-0" aria-hidden />
                        {daysText ? `Activa: ${daysText}` : "Todavía no elegiste ningún día"}
                      </p>
                      {errors.weekdays && <FieldError>{errors.weekdays}</FieldError>}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field data-invalid={!!errors.starts_on}>
                        <FieldLabel htmlFor="promo-start">Desde</FieldLabel>
                        <Input
                          id="promo-start"
                          type="date"
                          className="min-h-12"
                          min={today}
                          value={draft.starts_on}
                          aria-invalid={!!errors.starts_on}
                          onChange={(e) => patch({ starts_on: e.target.value, ...(draft.ends_on && e.target.value > draft.ends_on ? { ends_on: e.target.value } : {}) })}
                        />
                        {errors.starts_on && <FieldError>{errors.starts_on}</FieldError>}
                      </Field>
                      <Field data-invalid={!!errors.ends_on}>
                        <FieldLabel htmlFor="promo-end">Hasta (incluido)</FieldLabel>
                        <Input
                          id="promo-end"
                          type="date"
                          className="min-h-12"
                          min={draft.starts_on && draft.starts_on > today ? draft.starts_on : today}
                          value={draft.ends_on}
                          aria-invalid={!!errors.ends_on}
                          onChange={(e) => patch({ ends_on: e.target.value })}
                        />
                        {errors.ends_on && <FieldError>{errors.ends_on}</FieldError>}
                      </Field>
                    </div>
                  )}
                </Panel>
              </div>

              {/* Paso 4 — Canales */}
              <div hidden={step !== "canales"} className="flex flex-col gap-4">
                <Panel title="Dónde se aplica" description="Apaga los canales donde no quieres la promoción.">
                  {(
                    [
                      ["pos", "POS", POS_CHANNELS],
                      ["digital_menu", "Menú digital", DIGITAL_CHANNELS],
                    ] as const
                  ).map(([group, title, list]) => (
                    <div key={group} className="flex flex-col gap-2">
                      <p id={`promo-ch-${group}`} className="text-body-sm font-semibold text-foreground">{title}</p>
                      <div role="group" aria-labelledby={`promo-ch-${group}`} className="flex flex-wrap gap-2">
                        {list.map(([key, text]) => {
                          const groupValue = draft.service_options[group] as Record<string, boolean>;
                          return (
                            <PickChip
                              key={key}
                              checked={groupValue[key]}
                              onClick={() =>
                                patch({
                                  service_options: { ...draft.service_options, [group]: { ...groupValue, [key]: !groupValue[key] } },
                                })
                              }
                            >
                              {text}
                            </PickChip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {noChannel && (
                    <p className={cn("flex items-center gap-2 rounded-control border px-3 py-2 text-body-sm font-medium", toneSoft.attention)} role="status">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden /> Sin canales, la promoción no se aplicará en ningún pedido.
                    </p>
                  )}
                </Panel>
                <Panel title="Estado">
                  <label
                    htmlFor="promo-status"
                    className="flex min-h-16 cursor-pointer items-center gap-3 rounded-card border border-border bg-card p-3 transition-colors duration-150 hover:border-border-strong"
                  >
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full border", toneSoft[draft.status === "active" ? "money-in" : "neutral"])}>
                      {draft.status === "active" ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-semibold text-foreground">{draft.status === "active" ? "Activa" : "Pausada"}</span>
                      <span className="block text-meta leading-snug text-muted-foreground">
                        {draft.status === "active" ? "Se aplica en sus días o fechas." : "No se aplica hasta que la actives."}
                      </span>
                    </span>
                    <Switch id="promo-status" checked={draft.status === "active"} onCheckedChange={(on) => patch({ status: on ? "active" : "paused" })} />
                  </label>
                </Panel>
              </div>
            </div>

            <aside aria-label="Vista previa" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
              <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
              <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {label ? <PromoChip label={label} className="text-body-sm" /> : <span className="text-body-sm text-muted-foreground">Sin valor todavía</span>}
                </div>
                <p className="wrap-anywhere text-body font-semibold text-foreground">{draft.name.trim() || "Sin nombre"}</p>
                <p className="text-meta text-muted-foreground">
                  {draft.activation === "dates" && draft.type !== "buy_x_get_y"
                    ? draft.starts_on && draft.ends_on
                      ? activationSummary({ weekdays: null, starts_on: draft.starts_on, ends_on: draft.ends_on })
                      : "Elige las fechas"
                    : daysText
                      ? `Activa: ${daysText}`
                      : "Elige los días"}
                </p>
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-body-sm font-semibold text-foreground">
                    {affected.length} {affected.length === 1 ? "producto" : "productos"} con la promo
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {affected.slice(0, 8).map((p) => {
                      const price = p.min_variant_price ?? p.price;
                      const off =
                        draft.type === "discount" && Number(draft.value) > 0
                          ? promoLineDiscount(price, 1, [
                              { id: "", name: "", type: "discount", value_type: draft.value_type, value: Number(draft.value), receive_qty: null, buy_qty: null },
                            ])
                          : 0;
                      return (
                        <li key={p.id} className="flex items-baseline justify-between gap-2 text-body-sm">
                          <span className="min-w-0 truncate text-foreground">{p.name}</span>
                          {off > 0 ? (
                            <PromoPrice list={price} net={price - off} />
                          ) : (
                            <span className="shrink-0 tabular-nums text-muted-foreground">{formatPrice(price)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {affected.length > 8 && <p className="mt-1.5 text-meta text-muted-foreground">y {affected.length - 8} más</p>}
                  {affected.length === 0 && <p className="text-meta text-muted-foreground">Elige productos o categorías en el paso 2.</p>}
                </div>
              </div>
            </aside>
          </div>

          <footer className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6">
            {confirmClose ? (
              <div role="alert" className={cn("flex flex-wrap items-center gap-3 rounded-card border p-3", toneSoft["money-out"])}>
                <AlertTriangle className="size-5 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1 text-body-sm font-semibold">¿Descartar los cambios? Lo que no guardaste se perderá.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-12 bg-card" onClick={() => setConfirmClose(false)}>
                    Seguir editando
                  </Button>
                  <Button
                    type="button"
                    className="min-h-12 bg-money-out text-money-out-foreground hover:bg-money-out/90"
                    onClick={() => {
                      setConfirmClose(false);
                      setDirty(false);
                      setOpen(false);
                    }}
                  >
                    Descartar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {rootError && (
                  <p role="alert" className="flex w-full items-center gap-2 text-body-sm font-medium text-money-out-soft-foreground">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden /> {rootError}
                  </p>
                )}
                <Button type="button" variant="ghost" className="min-h-12" onClick={() => requestOpenChange(false)}>
                  Cancelar
                </Button>
                <div className="ml-auto flex flex-wrap gap-2">
                  {stepIndex > 0 && (
                    <Button type="button" variant="outline" className="min-h-12" onClick={() => goTo(STEPS[stepIndex - 1].id)}>
                      <ArrowLeft /> Atrás
                    </Button>
                  )}
                  {!isLastStep && (
                    <Button type="button" variant={isEdit ? "outline" : "default"} className="min-h-12" onClick={() => goTo(STEPS[stepIndex + 1].id)}>
                      Siguiente <ArrowRight />
                    </Button>
                  )}
                  {(isEdit || isLastStep) && (
                    <Button type="submit" className="min-h-12 bg-money-in text-money-in-foreground hover:bg-money-in/90" disabled={isPending}>
                      {isPending ? <Loader2 className="animate-spin" /> : <Check />}
                      {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear promoción"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </footer>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ProductPicker({
  categories,
  products,
  search,
  onSearch,
  selected,
  onChange,
}: {
  categories: AdminCategory[];
  products: AdminProduct[];
  search: string;
  onSearch: (v: string) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const term = normalizeText(search.trim());
  const groups = useMemo(() => {
    const visible = term ? products.filter((p) => normalizeText(p.name).includes(term)) : products;
    const named = categories
      .map((c) => ({ id: c.id, name: c.name, items: visible.filter((p) => p.category_id === c.id) }))
      .filter((g) => g.items.length > 0);
    const loose = visible.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id));
    return loose.length ? [...named, { id: "none", name: "Sin categoría", items: loose }] : named;
  }, [categories, products, term]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
            className="h-12 rounded-full pl-9"
          />
        </div>
        <span className="text-body-sm font-semibold tabular-nums text-muted-foreground" role="status">
          {selected.length} {selected.length === 1 ? "elegido" : "elegidos"}
        </span>
      </div>
      {groups.length === 0 && <p className="text-body-sm text-muted-foreground">Ningún producto coincide con “{search}”.</p>}
      {groups.map((g) => {
        const ids = g.items.map((p) => p.id);
        const all = ids.every((id) => selected.includes(id));
        return (
          <div key={g.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-body-sm font-semibold text-foreground">{g.name}</p>
              <button
                type="button"
                onClick={() => onChange(all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])}
                className={cn(posPressable, "min-h-12 rounded-button px-3 text-body-sm font-semibold text-muted-foreground hover:text-foreground")}
              >
                {all ? "Quitar todos" : "Elegir todos"}
              </button>
            </div>
            <div role="group" aria-label={g.name} className="flex flex-wrap gap-2">
              {g.items.map((p) => (
                <PickChip key={p.id} checked={selected.includes(p.id)} onClick={() => onChange(toggle(selected, p.id))}>
                  {p.name}
                </PickChip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepTabs({ current, onSelect, errorSteps }: { current: StepId; onSelect: (id: StepId) => void; errorSteps: Set<StepId> }) {
  return (
    <nav aria-label="Pasos de la promoción" className="w-full">
      <ol className="grid grid-cols-4 gap-1 rounded-control bg-muted p-1">
        {STEPS.map((s, i) => {
          const active = s.id === current;
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  posPressable,
                  "relative flex min-h-12 w-full items-center justify-center gap-2 rounded-control px-2 text-body-sm font-semibold",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-bold tabular-nums", active ? "bg-foreground text-background" : "bg-card text-muted-foreground")}>
                  {i + 1}
                </span>
                <span className="truncate max-sm:sr-only">{s.label}</span>
                {errorSteps.has(s.id) && (
                  <>
                    <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-money-out" />
                    <span className="sr-only"> (tiene errores)</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-body font-semibold leading-tight text-foreground">{title}</h3>
        {description && <p className="mt-1 text-meta leading-snug text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PickChip({
  checked,
  onClick,
  ariaLabel,
  compact,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  ariaLabel?: string;
  /** Narrow cells (day picker): less padding so the check and text fit. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        posPressable,
        "inline-flex min-h-12 max-w-full items-center justify-center rounded-button border-2 text-body-sm font-semibold",
        compact ? "gap-1 px-1.5" : "gap-2 px-4",
        checked ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-border-strong"
      )}
    >
      {checked ? <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}
