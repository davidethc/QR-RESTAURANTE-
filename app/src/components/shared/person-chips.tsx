import { CircleCheck, CircleDot, Clock } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import type { SplitPerson } from "@/lib/split-progress";

const STATUS = {
  PAID: { label: "Pagado", icon: CircleCheck, className: "border-money-in-border bg-money-in-soft text-money-in-soft-foreground" },
  CURRENT: { label: "Cobrando", icon: CircleDot, className: "border-foreground bg-card text-foreground shadow-md" },
  PENDING: { label: "Pendiente", icon: Clock, className: "border-attention-border bg-attention-soft text-attention-soft-foreground" },
} as const;

/**
 * Quién paga qué en una cuenta dividida: una ficha por persona con su monto
 * y su estado (icono + texto, no solo color). La que se está cobrando queda
 * resaltada. Lista anunciada: un lector de pantalla oye "Persona 2, $2,50,
 * cobrando".
 */
export function PersonChips({ persons, className }: { persons: SplitPerson[]; className?: string }) {
  if (persons.length === 0) return null;
  return (
    <ol aria-label="Personas" className={cn("flex flex-wrap gap-2", className)}>
      {persons.map((p) => {
        const s = STATUS[p.status];
        return (
          <li
            key={p.number}
            className={cn(
              "flex min-h-12 items-center gap-2 rounded-full border-2 py-1.5 pr-3.5 pl-2 transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none",
              s.className
            )}
          >
            <s.icon className="size-5 shrink-0" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="text-body-sm font-semibold">
                Persona {p.number} · <span className="tabular-nums">{formatPrice(p.amount)}</span>
              </span>
              <span className="text-caption font-medium opacity-90">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
