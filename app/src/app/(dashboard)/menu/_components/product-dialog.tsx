"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageFileInput } from "@/components/shared/image-file-input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
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
import { formatPrice } from "@/lib/utils";
import type { AdminCategory, AdminProduct } from "@/types/staff";
import { filterModifiers, type ModifierGroup } from "./modifier-model";

const NONE = "__none__";
const TOUCH = "min-h-11 min-w-11";

type VariantDraft = { key: string; id?: string; name: string; price: string };
type Channels = Record<string, boolean>;

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

export function ProductDialog({
  restaurantId,
  categories,
  allProducts,
  product,
  defaultCategoryId,
}: {
  restaurantId: string;
  categories: AdminCategory[];
  allProducts: AdminProduct[];
  product?: AdminProduct;
  defaultCategoryId?: string;
}) {
  const isEdit = !!product;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
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

  const previewUrl = useMemo(() => imageUrl, [imageUrl]);
  const linkedGroups = linkedIds
    .map((id) => groups?.find((g) => g.id === id))
    .filter((g): g is ModifierGroup => !!g);
  const availableGroups = filterModifiers(groups ?? [], search, false).filter(
    (g) => !linkedIds.includes(g.id),
  );

  const prices = variants.map((v) => parseMoney(v.price)).filter((n) => Number.isFinite(n));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const multiple = variants.length > 1;

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setDirty(true);
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
    return Object.keys(next).length ? null : payload;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setRootError(null);
    const payload = validate();
    if (!payload) return;
    startTransition(async () => {
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
      for (const id of initialLinked.filter((g) => !linkedIds.includes(g))) {
        const r = await unlinkProductModifierGroup(productId, id);
        if (!r.ok) partial = r.error;
      }
      for (const [position, groupId] of linkedIds.entries()) {
        const r = await linkProductModifierGroup({ product_id: productId, group_id: groupId, position });
        if (!r.ok) partial = r.error;
      }

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
      router.refresh();
    });
  }

  function requestOpenChange(next: boolean) {
    if (!next && dirty && !isPending) return setConfirmClose(true);
    setOpen(next);
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
    <>
      <Sheet open={open} onOpenChange={requestOpenChange}>
        <SheetTrigger asChild>
          {isEdit ? (
            <Button variant="ghost" size="icon" className={TOUCH} aria-label="Editar producto">
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="min-h-11">
              <Plus /> Producto
            </Button>
          )}
        </SheetTrigger>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md lg:max-w-4xl">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-5 sm:px-6">
            <SheetTitle className="text-title-sm font-semibold">
              {isEdit ? "Editar producto" : "Nuevo producto"}
            </SheetTitle>
            <SheetDescription>Aparecerá en la carta cuando lo guardes.</SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <FieldGroup className="min-w-0">
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="prod-name">Nombre</FieldLabel>
                  <Input
                    id="prod-name"
                    value={name}
                    aria-invalid={!!errors.name}
                    onChange={(e) => touch(setName)(e.target.value)}
                  />
                  {errors.name && <FieldError>{errors.name}</FieldError>}
                </Field>

                <Field>
                  <FieldLabel htmlFor="prod-category">Categoría</FieldLabel>
                  <Select
                    value={categoryId || NONE}
                    onValueChange={(v) => {
                      if (v === "__new__") return setNewCatOpen(true);
                      touch(setCategoryId)(v === NONE ? "" : v);
                    }}
                  >
                    <SelectTrigger id="prod-category" className="min-h-11 w-full">
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin categoría</SelectItem>
                      {allCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">+ Nueva categoría</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field data-invalid={!!errors.description}>
                  <FieldLabel htmlFor="prod-description">Descripción (opcional)</FieldLabel>
                  <Textarea
                    id="prod-description"
                    rows={2}
                    value={description}
                    onChange={(e) => touch(setDescription)(e.target.value)}
                  />
                  {errors.description && <FieldError>{errors.description}</FieldError>}
                </Field>

                <Field data-invalid={!!imageError}>
                  <FieldLabel htmlFor="prod-image">Foto (opcional, JPEG/PNG/WebP, máx. 5 MB)</FieldLabel>
                  <div onChange={onFileChange}>
                    <ImageFileInput id="prod-image" ref={fileInputRef} aria-describedby="prod-image-error" />
                  </div>
                  <div id="prod-image-error">{imageError && <FieldError>{imageError}</FieldError>}</div>
                </Field>

                <section aria-labelledby="prod-prices" className="flex flex-col gap-3 border-t border-border pt-5">
                  <p id="prod-prices" className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    {multiple ? "Precios por variante" : "Precio"}
                  </p>
                  {variants.map((v, i) => (
                    <div key={v.key} className="flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        {multiple && (
                          <div className="min-w-0 flex-1">
                            <Input
                              aria-label={`Nombre de variante ${i + 1}`}
                              placeholder="Nombre de variante"
                              className="min-h-11"
                              value={v.name}
                              aria-invalid={!!errors[`${v.key}.name`]}
                              onChange={(e) => updateVariant(v.key, { name: e.target.value })}
                            />
                            {errors[`${v.key}.name`] && <FieldError>{errors[`${v.key}.name`]}</FieldError>}
                          </div>
                        )}
                        <div className={multiple ? "w-28 shrink-0" : "min-w-0 flex-1"}>
                          <Input
                            aria-label={multiple ? `Precio de variante ${i + 1}` : "Precio"}
                            inputMode="decimal"
                            placeholder="0.00"
                            className="min-h-11"
                            value={v.price}
                            aria-invalid={!!errors[`${v.key}.price`]}
                            onChange={(e) => updateVariant(v.key, { price: e.target.value })}
                          />
                          {errors[`${v.key}.price`] && <FieldError>{errors[`${v.key}.price`]}</FieldError>}
                        </div>
                        {multiple && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={TOUCH}
                            aria-label={`Quitar variante ${i + 1}`}
                            onClick={() => {
                              setDirty(true);
                              setVariants((vs) => vs.filter((x) => x.key !== v.key));
                            }}
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 self-start"
                    onClick={() => {
                      setDirty(true);
                      setVariants((vs) => [...vs, { key: newKey(), name: "", price: "" }]);
                    }}
                  >
                    <Plus /> Agregar otro precio
                  </Button>
                </section>

                <section aria-labelledby="prod-mods" className="flex flex-col gap-3 border-t border-border pt-5">
                  <p id="prod-mods" className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                    Personalizaciones
                  </p>
                  {groupsError ? (
                    <p className="text-body-sm text-destructive" role="alert">
                      No pudimos cargar las personalizaciones. Cierra y vuelve a abrir el formulario.
                    </p>
                  ) : groups === null ? (
                    <p className="text-body-sm text-muted-foreground">Cargando personalizaciones…</p>
                  ) : (
                    <>
                      {linkedGroups.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {linkedGroups.map((g, i) => (
                            <li key={g.id} className="flex items-center gap-1 rounded-control border border-border p-2">
                              <div className="min-w-0 flex-1 px-1">
                                <p className="wrap-anywhere text-body-sm font-medium">{g.name}</p>
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
                                className={TOUCH}
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
                        </ul>
                      )}
                      {groups.length === 0 ? (
                        <p className="text-body-sm text-muted-foreground">No se han creado personalizaciones.</p>
                      ) : (
                        <>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              aria-label="Buscar personalización"
                              placeholder="Buscar personalización"
                              className="min-h-11 pl-9"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          {availableGroups.length === 0 ? (
                            <p className="text-body-sm text-muted-foreground">
                              {search ? "Ninguna personalización coincide." : "Ya agregaste todas."}
                              {search && (
                                <Button type="button" variant="link" className="min-h-11" onClick={() => setSearch("")}>
                                  Limpiar búsqueda
                                </Button>
                              )}
                            </p>
                          ) : (
                            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                              {availableGroups.map((g) => (
                                <li key={g.id} className="flex items-center gap-2">
                                  <span className="min-w-0 flex-1 wrap-anywhere text-body-sm">{g.name}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
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
                        </>
                      )}
                    </>
                  )}
                </section>

                <details className="group border-t border-border pt-5">
                  <summary className="flex min-h-11 cursor-pointer items-center text-body-sm font-medium">
                    Más opciones
                  </summary>
                  <div className="flex flex-col gap-5 pt-3">
                    <fieldset className="flex flex-col gap-3">
                      <legend className="mb-2 text-caption font-medium uppercase tracking-wider text-muted-foreground">
                        Opciones de servicio
                      </legend>
                      {[
                        ["POS", POS_CHANNELS],
                        ["Menú digital", DIGITAL_CHANNELS],
                      ].map(([title, list]) => (
                        <div key={title as string} className="flex flex-col gap-1">
                          <p className="text-body-sm font-medium">{title as string}</p>
                          {(list as readonly (readonly [string, string])[]).map(([key, label]) => (
                            <Field key={key} orientation="horizontal" className="min-h-11">
                              <FieldLabel htmlFor={`ch-${key}`}>{label}</FieldLabel>
                              <Switch
                                id={`ch-${key}`}
                                checked={channels[key]}
                                onCheckedChange={(c) => {
                                  setDirty(true);
                                  setChannels((s) => ({ ...s, [key]: c }));
                                }}
                              />
                            </Field>
                          ))}
                        </div>
                      ))}
                      {noChannel && (
                        <p className="text-body-sm text-warning-foreground" role="status">
                          Este producto no podrá pedirse.
                        </p>
                      )}
                    </fieldset>

                    <div className="flex flex-col gap-3">
                      <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                        En la carta
                      </p>
                      <Field orientation="horizontal" className="min-h-11">
                        <FieldLabel htmlFor="prod-available">Disponible</FieldLabel>
                        <Switch id="prod-available" checked={available} onCheckedChange={touch(setAvailable)} />
                      </Field>
                      <Field orientation="horizontal" className="min-h-11">
                        <FieldLabel htmlFor="prod-featured">
                          Destacado — aparece en &ldquo;Sugerencias&rdquo;
                        </FieldLabel>
                        <Switch id="prod-featured" checked={featured} onCheckedChange={touch(setFeatured)} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="prod-paired-drink">Bebida del combo (opcional)</FieldLabel>
                        <Select
                          value={pairedDrinkId || NONE}
                          onValueChange={(v) => touch(setPairedDrinkId)(v === NONE ? "" : v)}
                        >
                          <SelectTrigger id="prod-paired-drink" className="min-h-11 w-full">
                            <SelectValue placeholder="Sin bebida asociada" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sin bebida asociada</SelectItem>
                            {pairedOptions.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  </div>
                </details>

                {rootError && <FieldError>{rootError}</FieldError>}
              </FieldGroup>

              <aside aria-label="Vista previa" className="min-w-0 lg:sticky lg:top-0 lg:self-start">
                <p className="mb-2 text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  Vista previa
                </p>
                <div className="overflow-hidden rounded-card border border-border bg-card">
                  <div className="flex aspect-square items-center justify-center bg-muted text-muted-foreground">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-body-sm">Sin foto</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-4">
                    <p className="wrap-anywhere text-body font-semibold">{name || "Nombre del producto"}</p>
                    {description && (
                      <p className="wrap-anywhere text-body-sm text-muted-foreground">{description}</p>
                    )}
                    <p className="text-body-sm font-medium tabular-nums">
                      {minPrice === null ? "—" : `${multiple ? "Desde " : ""}${formatPrice(minPrice)}`}
                    </p>
                    {linkedGroups.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {linkedGroups.map((g) => (
                          <Badge key={g.id} variant="secondary">
                            {g.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
            <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => requestOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="min-h-11" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" />}
                {isPending ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
            <DialogDescription>Se agregará al menú general.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={!!newCatError}>
            <FieldLabel htmlFor="new-cat-name">Nombre</FieldLabel>
            <Input
              id="new-cat-name"
              className="min-h-11"
              value={newCatName}
              aria-invalid={!!newCatError}
              onChange={(e) => {
                setNewCatName(e.target.value);
                setNewCatError(null);
              }}
            />
            {newCatError && <FieldError>{newCatError}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setNewCatOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="min-h-11" disabled={newCatPending} onClick={addCategory}>
              {newCatPending && <Loader2 className="animate-spin" />}
              Agregar categoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Descartar los cambios?</DialogTitle>
            <DialogDescription>Los cambios que no guardaste se perderán.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmClose(false)}>
              Seguir editando
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                setConfirmClose(false);
                setDirty(false);
                setOpen(false);
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
