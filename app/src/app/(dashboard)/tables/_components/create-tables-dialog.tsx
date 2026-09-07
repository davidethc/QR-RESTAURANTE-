"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { createTables } from "@/lib/actions/tables";
import {
  createTablesSchema,
  type CreateTablesInput,
  type CreateTablesValues,
} from "@/lib/validations/tables";

/**
 * Alta de mesas.
 *
 * Hasta ahora no había forma de crear una mesa desde el panel: las de
 * la demo se insertaron por SQL. Para vender esto a un local de veinte
 * mesas, eso no servía.
 *
 * El rango es lo que ahorra el trabajo de verdad — "de la 1 a la 20" en
 * una sola acción — y con "desde" igual a "hasta" crea una sola, así
 * que no hacen falta dos formularios distintos.
 *
 * El QR de cada mesa no se pide ni se genera aquí: la columna
 * `qr_token` lo crea sola en la base al insertar la fila.
 */
export function CreateTablesDialog({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<CreateTablesInput, unknown, CreateTablesValues>({
    resolver: zodResolver(createTablesSchema),
    defaultValues: { fromNumber: 1, toNumber: 1, name: "" },
  });

  const from = Number(watch("fromNumber"));
  const to = Number(watch("toNumber"));
  const isSingle = Number.isFinite(from) && Number.isFinite(to) && from === to;

  function onSubmit(values: CreateTablesValues) {
    startTransition(async () => {
      const result = await createTables(
        restaurantId,
        values.fromNumber,
        values.toNumber,
        values.name
      );

      if (!result.ok) {
        setError("root", { message: result.error });
        return;
      }

      notify.success(
        result.data === 1 ? "Mesa creada" : `${result.data} mesas creadas`
      );
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Mesas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear mesas</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <div className="flex gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor="from-number">Desde la mesa</FieldLabel>
                <Input
                  id="from-number"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...register("fromNumber")}
                />
                <FieldError errors={[errors.fromNumber]} />
              </Field>
              <Field className="flex-1">
                <FieldLabel htmlFor="to-number">Hasta la mesa</FieldLabel>
                <Input
                  id="to-number"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...register("toNumber")}
                />
                <FieldError errors={[errors.toNumber]} />
              </Field>
            </div>

            {/* El nombre solo tiene sentido para una mesa: ponerle
                "Terraza" a un rango dejaría diez mesas llamadas igual. */}
            {isSingle && (
              <Field>
                <FieldLabel htmlFor="table-name">
                  Nombre (opcional) — ej. Terraza, Barra
                </FieldLabel>
                <Input id="table-name" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
            )}

            <p className="text-[13px] text-muted-foreground">
              {isSingle
                ? "Se creará 1 mesa con su código QR."
                : Number.isFinite(from) && Number.isFinite(to) && to > from
                  ? `Se crearán ${to - from + 1} mesas, cada una con su código QR.`
                  : "Cada mesa se crea con su propio código QR."}
            </p>

            <FieldError errors={[errors.root]} />
          </FieldGroup>

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
