"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { activateDeviceAction } from "@/lib/actions/device-session";

export function ActivateForm({ token, suggestedName }: { token: string; suggestedName: string }) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await activateDeviceAction({ token, name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/pin");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <Field>
        <FieldLabel htmlFor="device-name">Nombre del dispositivo</FieldLabel>
        <Input
          id="device-name"
          name="device-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tablet de meseros…"
          autoComplete="off"
          maxLength={60}
          className="min-h-11"
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full min-h-12">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Activar dispositivo
      </Button>
    </form>
  );
}
