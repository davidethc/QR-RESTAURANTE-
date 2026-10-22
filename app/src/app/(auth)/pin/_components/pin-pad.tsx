"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";
import { pinLoginAction } from "@/lib/actions/device-session";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const keyClass =
  "grid h-[72px] min-w-[72px] touch-manipulation select-none place-items-center rounded-card border border-border bg-card text-2xl font-semibold tabular-nums text-foreground shadow-sm transition-[transform,background-color] duration-100 active:scale-95 active:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-20";

export function PinPad({
  restaurantName,
  deviceName,
}: {
  restaurantName: string | null;
  deviceName: string | null;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  const submit = useCallback(
    (value: string) => {
      busy.current = true;
      setError(null);
      startTransition(async () => {
        const result = await pinLoginAction(value);
        if (!result.ok) {
          setError(result.error);
          setPin("");
          busy.current = false;
          return;
        }
        router.replace("/today?entrada=1");
        router.refresh();
      });
    },
    [router]
  );

  const press = useCallback(
    (digit: string) => {
      if (busy.current) return;
      setError(null);
      setPin((current) => {
        if (current.length >= PIN_LENGTH) return current;
        const next = current + digit;
        if (next.length === PIN_LENGTH) queueMicrotask(() => submit(next));
        return next;
      });
    },
    [submit]
  );

  const erase = useCallback(() => {
    if (busy.current) return;
    setPin((current) => current.slice(0, -1));
  }, []);

  // Teclado físico (computadora de caja).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, erase]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-control bg-primary text-body font-semibold text-primary-foreground">
            M
          </span>
          <h1 className="text-2xl font-semibold text-foreground text-balance">
            {restaurantName ?? "Monky"}
          </h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {deviceName ? `${deviceName}. ` : ""}Ingresa tu PIN de 4 dígitos.
          </p>
        </div>

        <div
          role="group"
          aria-label={`PIN: ${pin.length} de ${PIN_LENGTH} dígitos`}
          className="mb-3 flex justify-center gap-4"
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "size-4 rounded-full border-2 border-primary transition-colors motion-reduce:transition-none",
                i < pin.length ? "bg-primary" : "bg-transparent",
                pending && "animate-pulse motion-reduce:animate-none"
              )}
            />
          ))}
        </div>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            "mb-5 min-h-[3.5rem] text-center text-body-sm",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {pending ? "Validando…" : error}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((digit) => (
            <button
              key={digit}
              type="button"
              className={keyClass}
              disabled={pending}
              onClick={() => press(digit)}
            >
              {digit}
            </button>
          ))}
          <span aria-hidden />
          <button type="button" className={keyClass} disabled={pending} onClick={() => press("0")}>
            0
          </button>
          <button
            type="button"
            className={keyClass}
            disabled={pending || pin.length === 0}
            onClick={erase}
            aria-label="Borrar último dígito"
          >
            <Delete className="size-6" aria-hidden />
          </button>
        </div>

        <p className="mt-8 text-center text-body-sm">
          <Link href="/login" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Iniciar sesión con correo
          </Link>
        </p>
      </div>
    </main>
  );
}
