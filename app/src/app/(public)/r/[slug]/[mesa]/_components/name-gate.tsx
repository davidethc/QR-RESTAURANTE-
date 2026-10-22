"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openTableWithName } from "@/lib/actions/customer-session";
import { tableNameSchema } from "@/lib/validations/qr-client";

/**
 * Primer paso al escanear el QR: el cliente le pone nombre a la mesa.
 * Es el nombre que verá el mesero en el panel ("Ana", "Cumple de Luis").
 */
export function NameGate({
  restaurantName,
  tableNumber,
}: {
  restaurantName: string;
  tableNumber: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = tableNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nombre inválido.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await openTableWithName(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-dvh flex-col bg-primary-dark text-primary-dark-foreground">
      <div className="flex flex-1 flex-col justify-end gap-3 px-6 pb-8 pt-16">
        <span className="flex w-fit items-baseline gap-1.5 rounded-lg bg-honey px-3 py-1.5 text-honey-foreground">
          <span className="text-[12px] font-bold uppercase tracking-[0.14em]">Mesa</span>
          <span className="font-display text-[28px] font-bold leading-none">{tableNumber}</span>
        </span>
        <h1 className="font-display text-balance text-[32px] font-bold leading-tight">
          Bienvenido a {restaurantName}
        </h1>
        <p className="text-[16px] opacity-85">¿A nombre de quién ponemos la mesa?</p>
      </div>

      <form
        onSubmit={submit}
        noValidate
        className="rounded-t-3xl bg-background px-6 pt-6 text-foreground"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <label htmlFor="table-name" className="text-[14px] font-semibold">
          Tu nombre
        </label>
        <input
          id="table-name"
          name="name"
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="go"
          maxLength={40}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Ej. Ana"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "table-name-error" : undefined}
          className="mt-2 h-14 w-full rounded-2xl border border-border bg-card px-4 text-[18px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {error && (
          <p id="table-name-error" role="alert" className="mt-2 text-[14px] text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="clay clay-primary mt-4 h-14 w-full rounded-2xl text-[16px] font-semibold"
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Ver la carta
        </Button>
      </form>
    </main>
  );
}
