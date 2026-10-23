import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneBar, toneText, type PosTone } from "./pos-tone";

/**
 * Franja de estado del módulo: arriba de todo, una sola línea que responde
 * "¿dónde estoy y cómo está esto?" (estado + 2-3 cifras) y deja a mano las
 * acciones rápidas. En teléfono las cifras hacen scroll horizontal y las
 * acciones bajan a una fila propia.
 */
export function StatusStrip({
  status,
  metrics,
  actions,
  className,
}: {
  status: React.ReactNode;
  metrics?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Estado"
      className={cn(
        "flex flex-col gap-3 border-b border-border bg-card px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:gap-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none] lg:flex-1">
        {status}
        {metrics && <div className="flex shrink-0 items-stretch gap-4 border-l border-border pl-4">{metrics}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

/** Estado principal: punto de color + título + detalle. */
export function StatusPill({
  tone,
  icon: Icon,
  title,
  detail,
}: {
  tone: PosTone;
  icon: LucideIcon;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span className={cn("relative flex size-11 items-center justify-center rounded-full", toneBar[tone], "text-white")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold leading-tight text-foreground">{title}</p>
        {detail && <p className="text-meta leading-tight text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

/** Cifra con etiqueta corta. */
export function StatusMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: PosTone;
}) {
  return (
    <div className="flex shrink-0 flex-col justify-center">
      <span className="text-caption leading-tight text-muted-foreground">{label}</span>
      <span className={cn("text-lead font-semibold leading-tight tabular-nums", toneText[tone])}>{value}</span>
    </div>
  );
}
