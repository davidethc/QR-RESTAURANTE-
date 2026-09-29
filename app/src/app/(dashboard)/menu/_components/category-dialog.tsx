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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { createCategory, updateCategory } from "@/lib/actions/menu";
import { categorySchema, type CategoryInput } from "@/lib/validations/menu";
import type { AdminCategory } from "@/types/staff";

export function CategoryDialog({
  restaurantId,
  category,
}: {
  restaurantId: string;
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
        ? await updateCategory(category.id, values)
        : await createCategory(restaurantId, values);

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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Editar categoría">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> Categoría
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-5">
          <SheetTitle className="text-title-sm font-semibold">
            {isEdit ? "Editar categoría" : "Nueva categoría"}
          </SheetTitle>
          <SheetDescription>
            Agrupa los productos que se muestran juntos en la carta del QR.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
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
          </div>
          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-6 py-4">
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
