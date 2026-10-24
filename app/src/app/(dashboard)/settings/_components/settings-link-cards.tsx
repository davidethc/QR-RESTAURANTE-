import Link from "next/link";
import { ChevronRight, Globe, Printer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { posPressable, toneBar, toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import type { DigitalMenuStatus } from "@/types/digital-menu";

const MENU_STATUS: Record<DigitalMenuStatus, { label: string; tone: PosTone }> = {
  active: { label: "Activo", tone: "money-in" },
  paused: { label: "En pausa", tone: "attention" },
  inactive: { label: "Sin activar", tone: "neutral" },
};

/** Entry points to the settings screens that live on their own page. */
export function SettingsLinkCards({ menuStatus, className }: { menuStatus: DigitalMenuStatus | null; className?: string }) {
  const status = menuStatus ? MENU_STATUS[menuStatus] : null;
  return (
    <nav aria-label="Más ajustes" className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <LinkCard
        href="/settings/menu-digital"
        icon={Globe}
        tone={status?.tone ?? "info"}
        title="Menú digital"
        help="Pedidos a domicilio y para recoger: enlace, pausa, WhatsApp, envíos y métodos de pago."
        badge={status?.label}
      />
      <LinkCard
        href="/settings/printing"
        icon={Printer}
        tone="info"
        title="Impresión"
        help="Tickets del cliente y de cocina: encabezado, pie y tamaño de letra."
      />
    </nav>
  );
}

function LinkCard({
  href,
  icon: Icon,
  tone,
  title,
  help,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  tone: PosTone;
  title: string;
  help: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        posPressable,
        "relative flex min-h-20 items-center gap-3 overflow-hidden rounded-card border border-border bg-card p-4 hover:border-border-strong"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", toneBar[tone])} />
      <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-control border", toneSoft[tone])}>
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-foreground">
          {title}
          {badge && <span className={cn("rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft[tone])}>{badge}</span>}
        </span>
        <span className="text-meta leading-snug text-muted-foreground">{help}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
