"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
export function CreateTablesDialog({ restaurantId }: { restaurantId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateTablesInput, unknown, CreateTablesValues>({
    resolver: zodResolver(createTablesSchema),
    defaultValues: { fromNumber: 1, toNumber: 1, name: "" },
  });

  // `useWatch` en vez de `watch()`: aísla el re-render a este componente
  // cada vez que cambian estos dos campos, en vez de que `watch()`
  // suscriba (y re-renderice) el formulario entero por cada tecla.
  const [fromNumber, toNumber] = useWatch({
    control,
    name: ["fromNumber", "toNumber"],
  });
  const from = Number(fromNumber);
  const to = Number(toNumber);
  const isSingle = Number.isFinite(from) && Number.isFinite(to) && from === to;

  function onSubmit(values: CreateTablesValues) {
    startTransition(async () => {
      const result = await createTables(
        restaurantId,
        values.fromNumber,
        values.toNumber,
        values.name,
      );

      if (!result.ok) {
        setError("root", { message: result.error });
        return;
      }

      notify.success(
        result.data === 1 ? "Mesa creada" : `${result.data} mesas creadas`,
      );
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Plus /> Mesas
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-5">
          <SheetTitle className="text-title-sm font-semibold">
            Crear mesas
          </SheetTitle>
          <SheetDescription>
            Una o varias de una vez. Cada mesa sale con su código QR.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
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

              <p className="text-meta text-muted-foreground">
                {isSingle
                  ? "Se creará 1 mesa con su código QR."
                  : Number.isFinite(from) && Number.isFinite(to) && to > from
                    ? `Se crearán ${to - from + 1} mesas, cada una con su código QR.`
                    : "Cada mesa se crea con su propio código QR."}
              </p>

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
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
