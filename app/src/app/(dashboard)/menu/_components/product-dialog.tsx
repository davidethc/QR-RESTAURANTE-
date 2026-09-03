"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import {
  createProduct,
  updateProduct,
  uploadProductImage,
} from "@/lib/actions/menu";
import { productSchema, type ProductInput } from "@/lib/validations/menu";
import type { AdminCategory, AdminProduct } from "@/types/staff";

const NO_CATEGORY = "__none__";

export function ProductDialog({
  restaurantId,
  slug,
  categories,
  product,
  defaultCategoryId,
}: {
  restaurantId: string;
  slug: string;
  categories: AdminCategory[];
  product?: AdminProduct;
  defaultCategoryId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!product;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: product?.price ?? 0,
      category_id: product?.category_id ?? defaultCategoryId ?? "",
      available: product?.available ?? true,
      featured: product?.featured ?? false,
    },
  });

  function onSubmit(values: ProductInput) {
    startTransition(async () => {
      let productId: string;

      if (isEdit) {
        const result = await updateProduct(product.id, slug, values);
        if (!result.ok) {
          setError("root", { message: result.error });
          return;
        }
        productId = product.id;
      } else {
        const result = await createProduct(restaurantId, slug, values);
        if (!result.ok) {
          setError("root", { message: result.error });
          return;
        }
        productId = result.data;
      }

      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const formData = new FormData();
        formData.set("file", file);
        const uploadResult = await uploadProductImage(
          restaurantId,
          productId,
          slug,
          formData
        );
        if (!uploadResult.ok) {
          notify.error(uploadResult.error);
        }
      }

      notify.success(isEdit ? "Producto actualizado" : "Producto creado");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Editar producto">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus /> Producto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="prod-name">Nombre</FieldLabel>
              <Input id="prod-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="prod-description">
                Descripción (opcional)
              </FieldLabel>
              <Textarea id="prod-description" rows={2} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="prod-price">Precio</FieldLabel>
              <Input
                id="prod-price"
                type="number"
                step="0.01"
                min="0"
                {...register("price", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.price]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="prod-category">Categoría</FieldLabel>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select
                    value={field.value || NO_CATEGORY}
                    onValueChange={(v) =>
                      field.onChange(v === NO_CATEGORY ? "" : v)
                    }
                  >
                    <SelectTrigger id="prod-category" className="w-full">
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="prod-image">
                Foto (opcional, JPEG/PNG/WebP, máx. 5 MB)
              </FieldLabel>
              <Input
                id="prod-image"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="prod-available">Disponible</FieldLabel>
              <Controller
                control={control}
                name="available"
                render={({ field }) => (
                  <Switch
                    id="prod-available"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="prod-featured">
                Destacado — aparece en "Sugerencias"
              </FieldLabel>
              <Controller
                control={control}
                name="featured"
                render={({ field }) => (
                  <Switch
                    id="prod-featured"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </Field>

            <FieldError errors={[errors.root]} />
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
