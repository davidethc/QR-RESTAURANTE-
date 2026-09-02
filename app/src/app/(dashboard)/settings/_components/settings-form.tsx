"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { updateRestaurantSettings, uploadRestaurantLogo } from "@/lib/actions/restaurant";
import {
  restaurantSettingsSchema,
  type RestaurantSettingsInput,
} from "@/lib/validations/restaurant";
import type { RestaurantSettings } from "@/types/staff";

export function SettingsForm({
  restaurant,
}: {
  restaurant: RestaurantSettings;
}) {
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
        restaurant.slug,
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
          restaurant.slug,
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-lg">
      <FieldGroup>
        <Field>
          <FieldLabel>Logo</FieldLabel>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Store className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="rest-name">Nombre</FieldLabel>
          <Input id="rest-name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="rest-description">Descripción</FieldLabel>
          <Textarea id="rest-description" rows={3} {...register("description")} />
          <FieldError errors={[errors.description]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="rest-phone">Teléfono</FieldLabel>
          <Input id="rest-phone" type="tel" {...register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="rest-address">Dirección</FieldLabel>
          <Input id="rest-address" {...register("address")} />
          <FieldError errors={[errors.address]} />
        </Field>

        <FieldError errors={[errors.root]} />

        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending && <Loader2 className="animate-spin" />}
          Guardar cambios
        </Button>
      </FieldGroup>
    </form>
  );
}
