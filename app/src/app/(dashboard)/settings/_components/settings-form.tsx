"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageFileInput } from "@/components/shared/image-file-input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { updateRestaurantSettings, uploadRestaurantLogo } from "@/lib/actions/restaurant";
import {
  restaurantSettingsSchema,
  type RestaurantSettingsInput,
} from "@/lib/validations/restaurant";
import type { RestaurantSettings } from "@/types/staff";
import { SettingsCard } from "./settings-card";

export function SettingsForm({
  restaurant,
}: {
  restaurant: RestaurantSettings;
}) {
  // React Hook Form es una library conocida como incompatible con el
  // React Compiler (lee refs internamente al invocar `handleSubmit`):
  // esta directiva la saca del análisis del compilador en vez de pelear
  // contra un falso positivo que no representa un problema real.
  "use no memo";
  const [isPending, startTransition] = useTransition();
  const [logoUrl, setLogoUrl] = useState(restaurant.logo_url);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RestaurantSettingsInput>({
    resolver: zodResolver(restaurantSettingsSchema),
    defaultValues: {
      name: restaurant.name,
      description: restaurant.description ?? "",
      phone: restaurant.phone ?? "",
      address: restaurant.address ?? "",
    },
  });

  function onSubmit(values: RestaurantSettingsInput) {
    startTransition(async () => {
      const result = await updateRestaurantSettings(
        restaurant.id,
        values
      );
      if (!result.ok) {
        setError("root", { message: result.error });
        return;
      }

      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const formData = new FormData();
        formData.set("file", file);
        const uploadResult = await uploadRestaurantLogo(
          restaurant.id,
          formData
        );
        if (!uploadResult.ok) {
          notify.error(uploadResult.error);
        } else {
          setLogoUrl(uploadResult.data);
        }
      }

      notify.success("Configuración guardada");
      router.refresh();
    });
  }

  return (
    <form
      // React Hook Form lee un ref al invocar `handleSubmit` — el eslint
      // plugin del React Compiler no reconoce la directiva "use no memo"
      // de arriba para esta regla puntual; es un falso positivo conocido
      // de la library, no una lectura de ref durante el render real.
      // eslint-disable-next-line react-hooks/refs
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <SettingsCard
        id="settings-restaurant"
        title="Datos del restaurante"
        help="Lo que ven tus clientes arriba de la carta digital."
        icon={Store}
        tone="info"
        footer={
          <Button type="submit" disabled={isPending} className="min-h-11">
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar cambios
          </Button>
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rest-logo">Logo</FieldLabel>
            <div className="flex flex-wrap items-center gap-4 rounded-control border border-dashed border-border bg-background p-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-card">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Logo del restaurante"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Store className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <ImageFileInput
                  id="rest-logo"
                  ref={fileInputRef}
                  aria-describedby="rest-logo-hint"
                />
                <p id="rest-logo-hint" className="text-caption text-muted-foreground">
                  JPEG, PNG o WebP. Se sube al guardar.
                </p>
              </div>
            </div>
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rest-name">Nombre</FieldLabel>
              <Input id="rest-name" className="min-h-11" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="rest-phone">Teléfono</FieldLabel>
              <Input id="rest-phone" type="tel" className="min-h-11" {...register("phone")} />
              <FieldError errors={[errors.phone]} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="rest-description">Descripción</FieldLabel>
            <Textarea id="rest-description" rows={3} {...register("description")} />
            <FieldError errors={[errors.description]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="rest-address">Dirección</FieldLabel>
            <Input id="rest-address" className="min-h-11" {...register("address")} />
            <FieldError errors={[errors.address]} />
          </Field>

          <FieldError errors={[errors.root]} />
        </FieldGroup>
      </SettingsCard>
    </form>
  );
}
