import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { posPressable, toneBar, toneSoft, toneText, type PosTone } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";

/** Bloque con título: borde, fondo blanco y cabecera propia, para que cada sección se lea aparte. */
export function TodaySection({
  id,
  title,
  icon: Icon,
  aside,
  children,
  className,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col overflow-hidden rounded-card border border-border bg-card", className)}>
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h2 id={id} className="flex-1 text-body font-semibold text-foreground">
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/**
 * Aviso accionable: cuántos hay, qué son y a dónde ir a resolverlo. Con
 * cifra en cero queda en gris ("al día"); con algo pendiente toma el color
 * de su tono y una franja a la izquierda, como las tarjetas de Caja.
 */
export function AttentionRow({
  href,
  icon: Icon,
  tone,
  count,
  title,
  detail,
  cta,
}: {
  href: string;
  icon: LucideIcon;
  tone: PosTone;
  count: number;
  title: string;
  detail: string;
  cta: string;
}) {
  const active = count > 0;
  const shown: PosTone = active ? tone : "neutral";
  return (
    <li>
      <Link
        href={href}
        className={cn(
          posPressable,
          "relative flex min-h-16 items-center gap-3 overflow-hidden rounded-card border py-3 pr-3 pl-4",
          active ? cn(toneSoft[tone], "shadow-sm hover:shadow-md") : "border-border bg-card hover:border-border-strong"
        )}
      >
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", active ? toneBar[tone] : "bg-transparent")} />
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border",
            active ? "border-transparent bg-card" : "border-border bg-secondary text-muted-foreground",
            active && toneText[tone]
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-semibold leading-tight text-foreground">{title}</span>
          <span className={cn("truncate text-caption leading-tight", active ? toneText[shown] : "text-muted-foreground")}>{detail}</span>
        </span>
        <span className={cn("shrink-0 text-title-sm font-semibold tabular-nums", active ? toneText[tone] : "text-muted-foreground")}>{count}</span>
        <span
          className={cn(
            "hidden shrink-0 items-center gap-0.5 rounded-button px-2.5 py-1.5 text-body-sm font-semibold sm:flex",
            active ? "bg-card text-foreground" : "text-muted-foreground"
          )}
        >
          {active ? cta : "Ver"}
          <ChevronRight className="size-4" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

/** Acceso rápido a un módulo: icono, nombre y qué se hace allí. */
export function QuickAction({
  href,
  icon: Icon,
  title,
  description,
  tone = "neutral",
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: PosTone;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(posPressable, "flex min-h-14 items-center gap-3 rounded-card border border-border bg-card px-3 py-2.5 hover:border-border-strong hover:shadow-sm")}
      >
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-control border", toneSoft[tone])}>
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-semibold leading-tight text-foreground">{title}</span>
          <span className="truncate text-caption text-muted-foreground">{description}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
