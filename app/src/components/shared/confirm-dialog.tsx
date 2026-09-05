"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import type { ActionResult } from "@/types/actions";

/**
 * Confirmación explícita antes de una Server Action (entregar, cancelar,
 * eliminar). Controlado a mano en vez de dejar que Radix cierre el
 * diálogo al hacer clic: así se queda abierto mientras la acción está
 * en curso y solo se cierra cuando de verdad terminó bien.
 */
export function ConfirmDialog<T>({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive,
  action,
  successMessage,
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  action: () => Promise<ActionResult<T>>;
  successMessage?: string;
  onSuccess?: (data: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      setOpen(false);
      if (successMessage) notify.success(successMessage);
      onSuccess?.(result.data);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {/* 44px de alto: es el mínimo cómodo de Apple HIG y el nivel
            AAA de WCAG 2.2. Acá importa de verdad — del lado del
            cliente se toca con una mano y comiendo, y del lado del
            personal con prisa y a veces sin mirar. */}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isPending}
            className="min-h-11 rounded-xl text-[15px]"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={handleConfirm}
            className={cn(
              "clay min-h-11 rounded-xl text-[15px]",
              destructive ? "clay-wine" : "clay-primary"
            )}
          >
            {isPending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
