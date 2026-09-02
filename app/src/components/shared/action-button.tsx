"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications";
import type { ActionResult } from "@/types/actions";
import type { VariantProps } from "class-variance-authority";
import type { buttonVariants } from "@/components/ui/button";

type ButtonVariants = VariantProps<typeof buttonVariants>;

/**
 * Botón que ejecuta una Server Action y se bloquea mientras está en
 * proceso — la regla que se repite en cada wireframe de mesero y
 * cocina ("el botón deberá quedar bloqueado durante el procesamiento").
 *
 * Si la action falla, avisa con un toast automáticamente; el llamador
 * no tiene que manejar el error a mano. Cubre aceptar, rechazar,
 * preparar, marcar listo, entregar, cancelar y atender solicitudes:
 * todas comparten exactamente esta forma (ActionResult).
 */
export function ActionButton<T>({
  action,
  children,
  pendingText,
  successMessage,
  onSuccess,
  variant,
  size,
  className,
  disabled,
}: {
  action: () => Promise<ActionResult<T>>;
  children: React.ReactNode;
  pendingText?: string;
  successMessage?: string;
  onSuccess?: (data: T) => void;
  className?: string;
  disabled?: boolean;
} & ButtonVariants) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      if (successMessage) notify.success(successMessage);
      onSuccess?.(result.data);
    });
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || isPending}
      onClick={handleClick}
    >
      {isPending ? (
        <>
          <Loader2 className="animate-spin" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
