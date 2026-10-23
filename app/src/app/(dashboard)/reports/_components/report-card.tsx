import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TodaySection } from "../../today/_components/today-blocks";

/** Bloque de Reportes: la misma tarjeta con cabecera que Hoy y Ventas. */
export function ReportCard({
  id,
  title,
  icon,
  aside,
  children,
  className,
  flush,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sin relleno: para tablas y rejillas que llegan al borde. */
  flush?: boolean;
}) {
  return (
    <TodaySection id={id} title={title} icon={icon} aside={aside} className={className}>
      <div className={cn(!flush && "p-4")}>{children}</div>
    </TodaySection>
  );
}
