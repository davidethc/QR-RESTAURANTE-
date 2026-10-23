import { ArrowLeft, Loader2 } from "lucide-react";
import { posPressable, toneSolid, type PosTone } from "@/components/shared/pos-tone";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

/**
 * Pie fijo de cada paso: "Atrás" a la izquierda y UNA acción primaria grande
 * a la derecha. Sin red, la acción que mueve dinero se apaga y lo dice.
 */
export function StepFooter({
  onBack,
  backLabel = "Atrás",
  primaryLabel,
  onPrimary,
  primaryTone = "money-in",
  primaryType = "button",
  formId,
  disabled,
  pending,
  hint,
  needsNetwork = false,
  children,
}: {
  onBack?: () => void;
  backLabel?: string;
  primaryLabel?: React.ReactNode;
  onPrimary?: () => void;
  primaryTone?: PosTone;
  primaryType?: "button" | "submit";
  formId?: string;
  disabled?: boolean;
  pending?: boolean;
  /** Qué falta para poder seguir; se muestra encima del botón. */
  hint?: string | null;
  needsNetwork?: boolean;
  children?: React.ReactNode;
}) {
  const online = useOnline();
  const offline = needsNetwork && !online;
  return (
    <div className="flex flex-col gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
      {(hint || offline) && (
        <p role="status" className="text-meta font-medium text-attention-soft-foreground">
          {offline ? "Sin conexión: espera a que vuelva la red para cobrar." : hint}
        </p>
      )}
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              posPressable,
              "flex min-h-14 shrink-0 items-center gap-2 rounded-button border border-border bg-card px-4 text-body font-semibold text-foreground hover:bg-muted"
            )}
          >
            <ArrowLeft className="size-5" aria-hidden />
            <span className="max-sm:sr-only">{backLabel}</span>
          </button>
        )}
        {children}
        {primaryLabel && (
          <button
            type={primaryType}
            form={formId}
            onClick={onPrimary}
            disabled={disabled || pending || offline}
            className={cn(
              posPressable,
              "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-button px-5 text-lead font-semibold shadow-md",
              toneSolid[primaryTone]
            )}
          >
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
