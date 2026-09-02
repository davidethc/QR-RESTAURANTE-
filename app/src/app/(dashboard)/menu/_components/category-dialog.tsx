"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { createCategory, updateCategory } from "@/lib/actions/menu";
import { categorySchema, type CategoryInput } from "@/lib/validations/menu";
import type { AdminCategory } from "@/types/staff";

export function CategoryDialog({
  restaurantId,
  slug,
  category,
}: {
  restaurantId: string;
  slug: string;
  category?: AdminCategory;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!category;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });

  function onSubmit(values: CategoryInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCategory(category.id, slug, values)
        : await createCategory(restaurantId, slug, values);

      if (!result.ok) {
        setError("root", { message: result.error });
        return;
      }
      notify.success(isEdit ? "Categoría actualizada" : "Categoría creada");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Editar categoría">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> Categoría
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cat-name">Nombre</FieldLabel>
              <Input id="cat-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cat-description">
                Descripción (opcional)
              </FieldLabel>
              <Textarea id="cat-description" rows={2} {...register("description")} />
              <FieldError errors={[errors.description]} />
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
