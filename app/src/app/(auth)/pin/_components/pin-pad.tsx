"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Delete, Loader2, Mail, MonitorSmartphone } from "lucide-react";
import { pinLoginAction } from "@/lib/actions/device-session";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const keyClass =
  "grid h-[72px] min-w-[72px] touch-manipulation select-none place-items-center rounded-xl border border-border bg-background text-display font-semibold tabular-nums text-foreground transition-[transform,background-color,border-color] duration-150 ease-out hover:border-border-strong hover:bg-secondary active:scale-[0.97] active:bg-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-20";

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
    <main
      data-caja
      className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-8 sm:px-6"
    >
      <div className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div className="flex items-center gap-3.5 border-b border-border px-5 py-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-foreground text-title font-bold text-background">
            M
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-title font-bold leading-tight text-foreground">
              {restaurantName ?? "Monky"}
            </h1>
            {deviceName && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
                <MonitorSmartphone aria-hidden className="size-4 shrink-0" />
                {deviceName}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 pt-6">
        <p className="mb-4 text-center text-body-lg font-semibold text-foreground">
          Ingresa tu PIN de 4 dígitos
        </p>

        <div
          role="group"
          aria-label={`PIN: ${pin.length} de ${PIN_LENGTH} dígitos`}
          className="mb-3 flex justify-center gap-3"
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "flex size-12 items-center justify-center rounded-xl border-2 transition-colors duration-150 motion-reduce:transition-none",
                error
                  ? "border-money-out-border bg-money-out-soft"
                  : i < pin.length
                    ? "border-foreground bg-secondary"
                    : i === pin.length
                      ? "border-border-strong bg-card"
                      : "border-border bg-card",
                pending && "animate-pulse motion-reduce:animate-none"
              )}
            >
              {i < pin.length && <span className="size-3 rounded-full bg-foreground" />}
            </span>
          ))}
        </div>

        <div role="status" aria-live="polite" className="mb-4 flex min-h-[3.25rem] items-center justify-center">
          {pending ? (
            <span className="flex items-center gap-2 text-body-sm font-medium text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Validando…
            </span>
          ) : error ? (
            <span className="flex w-full items-start gap-2 rounded-xl border border-money-out-border bg-money-out-soft px-3 py-2.5 text-body-sm font-medium text-money-out-soft-foreground">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </span>
          ) : null}
        </div>

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

        </div>

        <div className="border-t border-border bg-secondary/60 px-5 py-3 text-center">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center gap-1.5 text-body-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Mail aria-hidden className="size-4" />
            Iniciar sesión con correo
          </Link>
        </div>
      </div>
    </main>
  );
}
