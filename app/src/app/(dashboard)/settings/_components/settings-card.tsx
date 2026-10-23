import type { LucideIcon } from "lucide-react";
import { toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";

/**
 * Sección de Configuración: tarjeta propia con icono, título, una línea de
 * ayuda y, si hace falta, un pie con la acción de guardar. Así cada grupo
 * de ajustes se lee aparte (mismo lenguaje que los bloques de Hoy/Caja).
 */
export function SettingsCard({
  id,
  title,
  help,
  icon: Icon,
  tone = "neutral",
  aside,
  footer,
  children,
  className,
}: {
  id: string;
  title: string;
  help: string;
  icon: LucideIcon;
  tone?: PosTone;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col overflow-hidden rounded-card border border-border bg-card", className)}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-control border", toneSoft[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="text-body font-semibold leading-tight text-foreground">
            {title}
          </h2>
          <p className="text-meta leading-snug text-muted-foreground">{help}</p>
        </div>
        {aside}
      </header>
      <div className="flex flex-col gap-5 p-4">{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-secondary/40 px-4 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Bloque de un ajuste dentro de una tarjeta: título corto + explicación + control. */
export function SettingRow({
  title,
  help,
  htmlFor,
  children,
}: {
  title: string;
  help?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-body-sm font-semibold text-foreground">
          {title}
        </label>
        {help && <p className="text-meta leading-snug text-muted-foreground">{help}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
