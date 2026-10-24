"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CupSoda,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Star,
  Tags,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageFileInput } from "@/components/shared/image-file-input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { notify } from "@/lib/notifications";
import {
  createCategory,
  createProduct,
  getCatalog,
  getModifierGroups,
  linkProductModifierGroup,
  unlinkProductModifierGroup,
  updateProduct,
  uploadProductImage,
} from "@/lib/actions/menu";
import { productSchema } from "@/lib/validations/menu";
import { cn, formatPrice } from "@/lib/utils";
import type { AdminCategory, AdminProduct } from "@/types/staff";
import { filterModifiers, type ModifierGroup } from "./modifier-model";

const TOUCH = "min-h-12 min-w-12";

type VariantDraft = { key: string; id?: string; name: string; price: string };
type Channels = Record<string, boolean>;
type StepId = "datos" | "variantes" | "extras" | "foto";

const STEPS: { id: StepId; label: string }[] = [
  { id: "datos", label: "Datos" },
  { id: "variantes", label: "Variantes" },
  { id: "extras", label: "Extras" },
  { id: "foto", label: "Foto" },
];

const POS_CHANNELS = [
  ["pos_tables", "Mesas"],
  ["pos_dine_in_no_table", "En el local"],
  ["pos_takeaway", "Para llevar"],
  ["pos_delivery", "Domicilio"],
] as const;
const DIGITAL_CHANNELS = [
  ["menu_tables", "Mesas"],
  ["menu_pickup", "Recoger"],
  ["menu_delivery", "Domicilio"],
] as const;
const ALL_ON: Channels = Object.fromEntries(
  [...POS_CHANNELS, ...DIGITAL_CHANNELS].map(([k]) => [k, true]),
);

function toServiceOptions(c: Channels) {
  return {
    pos: { tables: c.pos_tables, dine_in_no_table: c.pos_dine_in_no_table, takeaway: c.pos_takeaway, delivery: c.pos_delivery },
    digital_menu: { tables: c.menu_tables, pickup: c.menu_pickup, delivery: c.menu_delivery },
  };
}

function fromServiceOptions(o: unknown): Channels | null {
  const v = o as { pos?: Record<string, boolean>; digital_menu?: Record<string, boolean> } | null;
  if (!v?.pos || !v.digital_menu) return null;
  return {
    pos_tables: v.pos.tables !== false, pos_dine_in_no_table: v.pos.dine_in_no_table !== false,
    pos_takeaway: v.pos.takeaway !== false, pos_delivery: v.pos.delivery !== false,
    menu_tables: v.digital_menu.tables !== false, menu_pickup: v.digital_menu.pickup !== false,
    menu_delivery: v.digital_menu.delivery !== false,
  };
}

let keySeq = 0;
const newKey = () => `v${++keySeq}`;

function parseMoney(value: string) {
  return value.trim() === "" ? NaN : Number(value.replace(",", "."));
}

/** Variant errors are keyed `<variantKey>.<field>`; everything else lives in Datos. */
function stepOfError(key: string): StepId {
  return key.includes(".") ? "variantes" : "datos";
}

/**
 * Product editor as a full panel in four steps (Datos → Variantes → Extras →
 * Foto). Every step stays mounted (only hidden), so the chosen photo file and
 * the typed values survive moving between steps. Nothing opens over the panel:
 * the new category and the "discard changes?" confirmation are inline.
 */
export function ProductEditor({
  restaurantId,
  categories,
  allProducts,
  product,
  defaultCategoryId,
  trigger,
}: {
  restaurantId: string;
  categories: AdminCategory[];
  allProducts: AdminProduct[];
  product?: AdminProduct;
  defaultCategoryId?: string;
  trigger: ReactNode;
}) {
  const isEdit = !!product;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepId>("datos");
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? defaultCategoryId ?? "");
  const [extraCategories, setExtraCategories] = useState<AdminCategory[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([
    { key: newKey(), name: "", price: product ? String(product.price) : "" },
  ]);
  const [available, setAvailable] = useState(product?.available ?? true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [pairedDrinkId, setPairedDrinkId] = useState(product?.paired_drink_id ?? "");
  const [drinkSearch, setDrinkSearch] = useState("");
  const [channels, setChannels] = useState<Channels>(ALL_ON);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const [groups, setGroups] = useState<ModifierGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState(false);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [initialLinked, setInitialLinked] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatError, setNewCatError] = useState<string | null>(null);
  const [newCatPending, startNewCat] = useTransition();

  const allCategories = [...categories, ...extraCategories];
  const pairedOptions = allProducts.filter((p) => p.id !== product?.id);

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => {
      setDirty(true);
      setter(v);
    };
  }

  // Al abrir se cargan variantes y vínculos guardados, y la biblioteca de grupos.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      getModifierGroups(restaurantId),
      isEdit ? getCatalog(restaurantId) : Promise.resolve(null),
    ]).then(([groupResult, catalog]) => {
      if (cancelled) return;
      if (!groupResult.ok) setGroupsError(true);
      else setGroups(groupResult.data);
      if (catalog?.ok && product) {
        const row = catalog.data.products.find((p) => p.id === product.id);
        if (row) {
          const vs = [...row.product_variants].sort((a, b) => a.position - b.position);
          if (vs.length) {
            setVariants(
              vs.map((v) => ({ key: v.id, id: v.id, name: v.name, price: String(v.price) })),
            );
          }
          const saved = fromServiceOptions(row.service_options);
          if (saved) setChannels(saved);
          const ids = [...row.product_modifier_groups]
            .sort((a, b) => a.position - b.position)
            .map((l) => l.group_id);
          setLinkedIds(ids);
          setInitialLinked(ids);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, restaurantId, isEdit, product]);

  const linkedGroups = linkedIds
    .map((id) => groups?.find((g) => g.id === id))
    .filter((g): g is ModifierGroup => !!g);
  const availableGroups = filterModifiers(groups ?? [], search, false).filter(
    (g) => !linkedIds.includes(g.id),
  );

  const prices = variants.map((v) => parseMoney(v.price)).filter((n) => Number.isFinite(n));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const multiple = variants.length > 1;
  const categoryName = allCategories.find((c) => c.id === categoryId)?.name ?? null;
  const pairedDrink = pairedOptions.find((p) => p.id === pairedDrinkId) ?? null;
  const drinkMatches = useMemo(() => {
    const q = drinkSearch.trim().toLowerCase();
    return pairedOptions.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [pairedOptions, drinkSearch]);

  const errorSteps = new Set(Object.keys(errors).map(stepOfError));
  if (imageError) errorSteps.add("foto");
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isLastStep = stepIndex === STEPS.length - 1;

  /** Editing a field clears its stale error (and the step's red dot). */
  function clearError(...keys: string[]) {
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setDirty(true);
    clearError(...Object.keys(patch).map((f) => `${key}.${f}`));
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function moveLinked(index: number, delta: number) {
    setDirty(true);
    setLinkedIds((ids) => {
      const next = [...ids];
      const target = index + delta;
      if (target < 0 || target >= next.length) return ids;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function onFileChange() {
    const file = fileInputRef.current?.files?.[0];
    setImageError(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const probe = new window.Image();
    probe.onload = () => {
      setDirty(true);
      setImageUrl(url);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImageError("No pudimos leer esta imagen. Elige otra foto.");
    };
    probe.src = url;
  }

  function validate() {
    const next: Record<string, string> = {};
    const nums = variants.map((v) => parseMoney(v.price));
    const payload = {
      name,
      description,
      price: multiple ? Math.min(...nums.filter(Number.isFinite), Infinity) : nums[0],
      category_id: categoryId,
      available,
      featured,
      paired_drink_id: pairedDrinkId,
      service_options: toServiceOptions(channels),
      variants: variants.map((v, i) => ({
        ...(v.id ? { id: v.id } : {}),
        name: multiple ? v.name.trim() : "",
        price: nums[i],
      })),
    };
    if (!Number.isFinite(payload.price)) payload.price = Number.NaN;
    const parsed = productSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, index, field] = issue.path;
        if (first === "variants" && typeof index === "number") {
          const key = variants[index]?.key;
          next[`${key}.${field === "name" ? "name" : "price"}`] ??=
            Number.isNaN(nums[index]) && field !== "name"
              ? "Escribe un precio de 0 o más, con hasta 2 decimales."
              : issue.message;
        } else if (first === "price") {
          next[`${variants[0].key}.price`] ??= "Escribe un precio de 0 o más, con hasta 2 decimales.";
        } else {
          next[String(first)] ??= issue.message;
        }
      }
    }
    // Una fila vacía agregada por accidente no se guarda en silencio.
    if (multiple) {
      variants.forEach((v) => {
        if (!v.name.trim()) next[`${v.key}.name`] ??= "Nombra esta variante.";
        if (!v.price.trim()) next[`${v.key}.price`] ??= "Escribe un precio.";
      });
    } else if (!variants[0].price.trim()) {
      next[`${variants[0].key}.price`] ??= "Escribe un precio.";
    }
    setErrors(next);
    const keys = Object.keys(next);
    if (keys.length) {
      // Lleva al primer paso con errores para que se vea qué falta.
      const failing = STEPS.find((s) => keys.some((k) => stepOfError(k) === s.id));
      if (failing) setStep(failing.id);
      return null;
    }
    return payload;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Un producto nuevo recorre los pasos: Enter en un campo avanza, no crea.
    if (!isEdit && !isLastStep) return goTo(STEPS[stepIndex + 1].id);
    // El ref cierra la ventana entre el clic y el re-render con isPending.
    if (isPending || submittingRef.current) return;
    setRootError(null);
    const payload = validate();
    if (!payload) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        await save(payload);
      } finally {
        submittingRef.current = false;
      }
    });
  }

  async function save(payload: NonNullable<ReturnType<typeof validate>>) {
    let productId: string;
    if (isEdit) {
      const result = await updateProduct(product.id, payload);
      if (!result.ok) return setRootError(result.error);
      productId = product.id;
    } else {
      const result = await createProduct(restaurantId, payload);
      if (!result.ok) return setRootError(result.error);
      productId = result.data;
    }

    let partial: string | null = null;
    // Cada vínculo es una fila distinta (product_id, group_id): el upsert/
    // delete de uno no depende de otro, así que van juntos en vez de en serie.
    const results = await Promise.all([
      ...initialLinked
        .filter((g) => !linkedIds.includes(g))
        .map((id) => unlinkProductModifierGroup(productId, id)),
      ...linkedIds.map((groupId, position) =>
        linkProductModifierGroup({ product_id: productId, group_id: groupId, position })
      ),
    ]);
    for (const r of results) if (!r.ok) partial = r.error;

    const file = fileInputRef.current?.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.set("file", file);
      const uploadResult = await uploadProductImage(restaurantId, productId, formData);
      if (!uploadResult.ok) partial = `El producto ya se guardó, pero la foto falló: ${uploadResult.error}`;
    }

    if (partial) notify.error(partial);
    else notify.success(isEdit ? "Producto actualizado" : "Producto creado");
    setOpen(false);
    setDirty(false);
    if (!isEdit) resetDraft();
    router.refresh();
  }

  /** A created product leaves an empty form for the next one. */
  function resetDraft() {
    setName("");
    setDescription("");
    setCategoryId(defaultCategoryId ?? "");
    setVariants([{ key: newKey(), name: "", price: "" }]);
    setAvailable(true);
    setFeatured(false);
    setPairedDrinkId("");
    setChannels(ALL_ON);
    setImageUrl(null);
    setLinkedIds([]);
    setInitialLinked([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function requestOpenChange(next: boolean) {
    if (!next && dirty && !isPending) return setConfirmClose(true);
    setConfirmClose(false);
    if (next) setStep("datos");
    setOpen(next);
  }

  function goTo(id: StepId) {
    setConfirmClose(false);
    setStep(id);
  }

  function addCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return setNewCatError("El nombre es obligatorio");
    startNewCat(async () => {
      const result = await createCategory(restaurantId, { name: trimmed });
      if (!result.ok) return setNewCatError(result.error);
      setExtraCategories((c) => [
        ...c,
        { id: result.data, name: trimmed, description: null } as AdminCategory,
      ]);
      setCategoryId(result.data);
      setDirty(true);
      setNewCatOpen(false);
      setNewCatName("");
      setNewCatError(null);
    });
  }

  const noChannel = Object.values(channels).every((v) => !v);

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:lg:max-w-[70rem]"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <UtensilsCrossed className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-body font-semibold leading-tight text-foreground">
              {isEdit ? `Editar ${product.name}` : "Nuevo producto"}
            </SheetTitle>
            <SheetDescription className="text-meta leading-tight text-muted-foreground">
              {isEdit ? "Cambia lo que necesites y guarda." : "Completa los pasos y créalo; aparecerá en la carta."}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => requestOpenChange(false)}
            aria-label="Cerrar editor"
            className={cn(posPressable, TOUCH, "flex items-center justify-center rounded-button text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            <X className="size-5" aria-hidden />
          </button>
          <StepTabs current={step} onSelect={goTo} errorSteps={errorSteps} />
        </header>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-4">
              {/* Paso 1 — Datos */}
              <div hidden={step !== "datos"} className="flex flex-col gap-4">
                <Panel title="Lo básico" description="Así aparece el producto en la carta y en el POS.">
                  <Field data-invalid={!!errors.name}>
                    <FieldLabel htmlFor="prod-name">Nombre</FieldLabel>
                    <Input
                      id="prod-name"
                      className="min-h-12"
                      value={name}
                      aria-invalid={!!errors.name}
                      onChange={(e) => {
                        clearError("name");
                        touch(setName)(e.target.value);
                      }}
                    />
                    {errors.name && <FieldError>{errors.name}</FieldError>}
                  </Field>
                  <Field data-invalid={!!errors.description}>
                    <FieldLabel htmlFor="prod-description">Descripción (opcional)</FieldLabel>
                    <Textarea
                      id="prod-description"
                      rows={2}
                      value={description}
                      onChange={(e) => {
                        clearError("description");
                        touch(setDescription)(e.target.value);
                      }}
                    />
                    {errors.description && <FieldError>{errors.description}</FieldError>}
                  </Field>
                </Panel>

                <Panel title="Categoría" description="Toca la sección de la carta donde va.">
                  <div role="radiogroup" aria-label="Categoría" className="flex flex-wrap gap-2">
                    {[{ id: "", name: "Sin categoría" }, ...allCategories].map((c) => (
                      <PickChip
                        key={c.id || "none"}
                        role="radio"
                        checked={categoryId === c.id}
                        onClick={() => touch(setCategoryId)(c.id)}
                      >
                        {c.name}
                      </PickChip>
                    ))}
                    {!newCatOpen && (
                      <button
                        type="button"
                        onClick={() => setNewCatOpen(true)}
                        className={cn(posPressable, "inline-flex min-h-12 items-center gap-1.5 rounded-button border-2 border-dashed border-border-strong px-4 text-body-sm font-semibold text-muted-foreground hover:border-foreground hover:text-foreground")}
                      >
                        <Plus className="size-4" aria-hidden /> Nueva categoría
                      </button>
                    )}
                  </div>
                  {newCatOpen && (
                    <div className="flex flex-col gap-2 rounded-card border border-border bg-secondary p-3">
                      <Field data-invalid={!!newCatError}>
                        <FieldLabel htmlFor="new-cat-name">Nombre de la nueva categoría</FieldLabel>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            id="new-cat-name"
                            className="min-h-12 min-w-0 flex-1 basis-48 bg-card"
                            value={newCatName}
                            aria-invalid={!!newCatError}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addCategory();
                              }
                            }}
                            onChange={(e) => {
                              setNewCatName(e.target.value);
                              setNewCatError(null);
                            }}
                          />
                          <Button type="button" className="min-h-12" disabled={newCatPending} onClick={addCategory}>
                            {newCatPending ? <Loader2 className="animate-spin" /> : <Plus />}
                            Agregar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-12"
                            onClick={() => {
                              setNewCatOpen(false);
                              setNewCatName("");
                              setNewCatError(null);
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                        {newCatError && <FieldError>{newCatError}</FieldError>}
                      </Field>
                    </div>
                  )}
                </Panel>

                <Panel title="En la carta">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ToggleCard
                      id="prod-available"
                      icon={available ? Check : AlertTriangle}
                      tone={available ? "money-in" : "money-out"}
                      title={available ? "Disponible" : "Agotado"}
                      description={available ? "Se puede pedir." : "No se puede pedir hasta que lo actives."}
                      checked={available}
                      onCheckedChange={touch(setAvailable)}
                    />
                    <ToggleCard
                      id="prod-featured"
                      icon={Star}
                      tone={featured ? "attention" : "neutral"}
                      title="Destacado"
                      description="Aparece en “Sugerencias”."
                      checked={featured}
                      onCheckedChange={touch(setFeatured)}
                    />
                  </div>
                </Panel>

                <Panel title="Dónde se vende" description="Apaga los canales donde no se ofrece.">
                  {[
                    ["POS", POS_CHANNELS],
                    ["Menú digital (QR)", DIGITAL_CHANNELS],
                  ].map(([title, list]) => (
                    <div key={title as string} className="flex flex-col gap-2">
                      <p id={`ch-${title as string}`} className="text-body-sm font-semibold text-foreground">{title as string}</p>
                      <div role="group" aria-labelledby={`ch-${title as string}`} className="flex flex-wrap gap-2">
                        {(list as readonly (readonly [string, string])[]).map(([key, label]) => (
                          <PickChip
                            key={key}
                            checked={channels[key]}
                            onClick={() => {
                              setDirty(true);
                              setChannels((s) => ({ ...s, [key]: !s[key] }));
                            }}
                          >
                            {label}
                          </PickChip>
                        ))}
                      </div>
                    </div>
                  ))}
                  {noChannel && (
                    <p className={cn("flex items-center gap-2 rounded-control border px-3 py-2 text-body-sm font-medium", toneSoft.attention)} role="status">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden /> Este producto no podrá pedirse.
                    </p>
                  )}
                </Panel>
              </div>

              {/* Paso 2 — Variantes */}
              <div hidden={step !== "variantes"} className="flex flex-col gap-4">
                <Panel
                  title={multiple ? "Precios por variante" : "Precio"}
                  description={multiple ? "Cada variante lleva su nombre y su precio (ej. Pequeño, Grande)." : "Si se vende en tamaños, agrega otro precio."}
                >
                  <ul className="flex flex-col gap-2">
                    {variants.map((v, i) => (
                      <li key={v.key} className="flex flex-wrap items-start gap-2 rounded-card border border-border bg-card p-3 sm:flex-nowrap">
                        {multiple && (
                          <span className="mt-3 flex size-7 shrink-0 max-sm:hidden items-center justify-center rounded-full bg-secondary text-caption font-bold tabular-nums text-muted-foreground">
                            {i + 1}
                          </span>
                        )}
                        {multiple && (
                          <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-3.5rem)]">
                            <Input
                              aria-label={`Nombre de variante ${i + 1}`}
                              placeholder="Nombre de variante"
                              className="min-h-12"
                              value={v.name}
                              aria-invalid={!!errors[`${v.key}.name`]}
                              onChange={(e) => updateVariant(v.key, { name: e.target.value })}
                            />
                            {errors[`${v.key}.name`] && <FieldError>{errors[`${v.key}.name`]}</FieldError>}
                          </div>
                        )}
                        <div className={multiple ? "shrink-0 max-sm:order-last max-sm:w-full sm:w-32" : "min-w-0 flex-1"}>
                          <div className="relative">
                            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body font-semibold text-muted-foreground">$</span>
                            <Input
                              aria-label={multiple ? `Precio de variante ${i + 1}` : "Precio"}
                              inputMode="decimal"
                              placeholder="0.00"
                              className="min-h-12 pl-7 text-body font-semibold tabular-nums"
                              value={v.price}
                              aria-invalid={!!errors[`${v.key}.price`]}
                              onChange={(e) => updateVariant(v.key, { price: e.target.value })}
                            />
                          </div>
                          {errors[`${v.key}.price`] && <FieldError>{errors[`${v.key}.price`]}</FieldError>}
                        </div>
                        {multiple && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(TOUCH, "text-muted-foreground hover:text-money-out")}
                            aria-label={`Quitar variante ${i + 1}`}
                            onClick={() => {
                              setDirty(true);
                              setVariants((vs) => vs.filter((x) => x.key !== v.key));
                            }}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 self-start"
                    onClick={() => {
                      setDirty(true);
                      setVariants((vs) => [...vs, { key: newKey(), name: "", price: "" }]);
                    }}
                  >
                    <Plus /> Agregar otro precio
                  </Button>
                </Panel>
              </div>

              {/* Paso 3 — Extras */}
              <div hidden={step !== "extras"} className="flex flex-col gap-4">
                <Panel title="Personalizaciones" description="Grupos de opciones que el cliente elige (ej. término, salsas). Se muestran en este orden.">
                  {groupsError ? (
                    <p className={cn("flex items-center gap-2 rounded-control border px-3 py-2 text-body-sm font-medium", toneSoft["money-out"])} role="alert">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden />
                      No pudimos cargar las personalizaciones. Cierra y vuelve a abrir el editor.
                    </p>
                  ) : groups === null ? (
                    <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando personalizaciones…
                    </p>
                  ) : (
                    <>
                      {groups.length === 0 ? null : linkedGroups.length > 0 ? (
                        <ol className="flex flex-col gap-2">
                          {linkedGroups.map((g, i) => (
                            <li key={g.id} className="flex items-center gap-1 rounded-card border border-border bg-card p-2 pl-3">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-caption font-bold tabular-nums text-background">{i + 1}</span>
                              <div className="min-w-0 flex-1 px-2">
                                <p className="wrap-anywhere text-body-sm font-semibold">{g.name}</p>
                                <p className="text-caption text-muted-foreground">
                                  {g.min_select > 0 ? "Obligatorio" : "Opcional"} · hasta {g.max_select} ·{" "}
                                  {g.modifier_options.length} opciones
                                </p>
                              </div>
                              <Button type="button" variant="ghost" size="icon" className={TOUCH} aria-label={`Subir ${g.name}`} disabled={i === 0} onClick={() => moveLinked(i, -1)}>
                                <ArrowUp />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className={TOUCH} aria-label={`Bajar ${g.name}`} disabled={i === linkedGroups.length - 1} onClick={() => moveLinked(i, 1)}>
                                <ArrowDown />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(TOUCH, "hover:text-money-out")}
                                aria-label={`Quitar ${g.name}`}
                                onClick={() => {
                                  setDirty(true);
                                  setLinkedIds((ids) => ids.filter((x) => x !== g.id));
                                }}
                              >
                                <X />
                              </Button>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="rounded-card border border-dashed border-border-strong px-3 py-3 text-body-sm text-muted-foreground">
                          Este producto no tiene personalizaciones. Agrega una de la lista.
                        </p>
                      )}
                      {groups.length === 0 ? (
                        <p className="text-body-sm text-muted-foreground">
                          Aún no hay personalizaciones. Créalas en la pestaña “Personalizaciones” de la Carta.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 border-t border-border pt-4">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                              aria-label="Buscar personalización"
                              placeholder="Buscar personalización"
                              className="min-h-12 pl-9"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          {availableGroups.length === 0 ? (
                            <p className="text-body-sm text-muted-foreground">
                              {search ? "Ninguna personalización coincide." : "Ya agregaste todas."}
                              {search && (
                                <Button type="button" variant="link" className="min-h-12" onClick={() => setSearch("")}>
                                  Limpiar búsqueda
                                </Button>
                              )}
                            </p>
                          ) : (
                            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                              {availableGroups.map((g) => (
                                <li key={g.id} className="flex items-center gap-2 rounded-control px-1 hover:bg-secondary">
                                  <span className="min-w-0 flex-1 wrap-anywhere text-body-sm">{g.name}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-12"
                                    onClick={() => {
                                      setDirty(true);
                                      setLinkedIds((ids) => [...ids, g.id]);
                                    }}
                                  >
                                    <Plus /> Agregar
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </Panel>

                <Panel title="Bebida del combo (opcional)" description="Se ofrece junto a este producto.">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-body-sm font-semibold", pairedDrink ? toneSoft.info : "border-border bg-secondary text-muted-foreground")}>
                      <CupSoda className="size-4" aria-hidden />
                      {pairedDrink ? pairedDrink.name : "Sin bebida asociada"}
                    </span>
                    {pairedDrink && (
                      <Button type="button" variant="ghost" className="min-h-12" onClick={() => touch(setPairedDrinkId)("")}>
                        <X /> Quitar
                      </Button>
                    )}
                  </div>
                  {pairedOptions.length > 0 && (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          aria-label="Buscar bebida"
                          placeholder="Buscar producto"
                          className="min-h-12 pl-9"
                          value={drinkSearch}
                          onChange={(e) => setDrinkSearch(e.target.value)}
                        />
                      </div>
                      <div role="radiogroup" aria-label="Bebida del combo" className="flex max-h-48 flex-wrap gap-2 overflow-y-auto p-0.5">
                        {drinkMatches.length === 0 ? (
                          <p className="text-body-sm text-muted-foreground">Ningún producto coincide.</p>
                        ) : (
                          drinkMatches.map((p) => (
                            <PickChip
                              key={p.id}
                              role="radio"
                              checked={pairedDrinkId === p.id}
                              onClick={() => touch(setPairedDrinkId)(p.id)}
                            >
                              {p.name}
                            </PickChip>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </Panel>
              </div>

              {/* Paso 4 — Foto */}
              <div hidden={step !== "foto"} className="flex flex-col gap-4">
                <Panel title="Foto" description="Opcional. JPEG, PNG o WebP, hasta 5 MB. Una foto clara vende más.">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="relative flex aspect-square w-full max-w-56 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-secondary text-muted-foreground">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex flex-col items-center gap-2 text-body-sm">
                          <ImageIcon className="size-8" strokeWidth={1.5} aria-hidden /> Sin foto
                        </span>
                      )}
                    </div>
                    <Field data-invalid={!!imageError} className="min-w-0 flex-1">
                      <FieldLabel htmlFor="prod-image">{imageUrl ? "Cambiar foto" : "Subir foto"}</FieldLabel>
                      <div onChange={onFileChange}>
                        <ImageFileInput id="prod-image" ref={fileInputRef} aria-describedby="prod-image-error" />
                      </div>
                      <div id="prod-image-error">{imageError && <FieldError>{imageError}</FieldError>}</div>
                    </Field>
                  </div>
                </Panel>
              </div>
            </div>

            <aside aria-label="Vista previa" className="min-w-0 max-lg:hidden lg:sticky lg:top-0 lg:self-start">
              <p className="mb-2 text-body-sm font-semibold text-muted-foreground">Así se verá</p>
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
                <div className="flex aspect-[4/3] items-center justify-center bg-secondary text-muted-foreground">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-8" strokeWidth={1.5} aria-hidden />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip available={available} />
                    {featured && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.attention)}>
                        <Star className="size-3.5" aria-hidden /> Destacado
                      </span>
                    )}
                  </div>
                  <p className="wrap-anywhere text-body font-semibold">{name || "Nombre del producto"}</p>
                  {categoryName && (
                    <p className="flex items-center gap-1 text-caption text-muted-foreground">
                      <Tags className="size-3.5" aria-hidden /> {categoryName}
                    </p>
                  )}
                  {description && (
                    <p className="line-clamp-3 wrap-anywhere text-body-sm text-muted-foreground">{description}</p>
                  )}
                  <p className="text-lead font-semibold tabular-nums">
                    {minPrice === null ? "—" : `${multiple ? "Desde " : ""}${formatPrice(minPrice)}`}
                  </p>
                  {linkedGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {linkedGroups.map((g) => (
                        <span key={g.id} className="rounded-full bg-secondary px-2 py-0.5 text-caption font-medium text-foreground">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
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
                    <Button
                      type="button"
                      variant={isEdit ? "outline" : "default"}
                      className="min-h-12"
                      onClick={() => goTo(STEPS[stepIndex + 1].id)}
                    >
                      Siguiente <ArrowRight />
                    </Button>
                  )}
                  {(isEdit || isLastStep) && (
                    <Button
                      type="submit"
                      className="min-h-12 bg-money-in text-money-in-foreground hover:bg-money-in/90"
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="animate-spin" /> : <Check />}
                      {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear producto"}
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

/** Steps as tabs: any step can be opened; a red dot marks the ones with errors. */
function StepTabs({
  current,
  onSelect,
  errorSteps,
}: {
  current: StepId;
  onSelect: (id: StepId) => void;
  errorSteps: Set<StepId>;
}) {
  return (
    <nav aria-label="Pasos del producto" className="w-full">
      <ol className="grid grid-cols-4 gap-1 rounded-control bg-muted p-1">
        {STEPS.map((s, i) => {
          const active = s.id === current;
          const hasError = errorSteps.has(s.id);
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
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-bold tabular-nums",
                    active ? "bg-foreground text-background" : "bg-card text-muted-foreground"
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate max-sm:sr-only">{s.label}</span>
                {hasError && (
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

/** Big chip to pick or toggle one option; the checked state shows a check, not only color. */
function PickChip({
  checked,
  onClick,
  role,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  role?: "radio";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? checked : undefined}
      aria-pressed={role ? undefined : checked}
      onClick={onClick}
      className={cn(
        posPressable,
        "inline-flex min-h-12 max-w-full items-center gap-2 rounded-button border-2 px-4 text-body-sm font-semibold",
        checked
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:border-border-strong"
      )}
    >
      {checked ? <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

function ToggleCard({
  id,
  icon: Icon,
  tone,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof toneSoft;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-16 cursor-pointer items-center gap-3 rounded-card border border-border bg-card p-3 transition-colors duration-150 hover:border-border-strong"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full border", toneSoft[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-semibold text-foreground">{title}</span>
        <span className="block text-meta leading-snug text-muted-foreground">{description}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/** Availability chip shared by the product card and the preview: icon + text, never color alone. */
export function StatusChip({ available }: { available: boolean }) {
  return available ? (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft["money-in"])}>
      <Check className="size-3.5" strokeWidth={3} aria-hidden /> Disponible
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft["money-out"])}>
      <X className="size-3.5" strokeWidth={3} aria-hidden /> Agotado
    </span>
  );
}
