import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepItem {
  id: string;
  label: string;
}

/**
 * Pasos numerados de un flujo (cobro, corte). Los pasos SÍ son una secuencia,
 * por eso llevan número. Los ya hechos llevan check y, si hay `onStepClick`,
 * se puede volver a ellos; los que faltan no se pueden saltar.
 */
export function StepIndicator({
  steps,
  current,
  onStepClick,
  className,
}: {
  steps: StepItem[];
  current: string;
  onStepClick?: (id: string) => void;
  className?: string;
}) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <nav aria-label="Pasos" className={className}>
      <ol className="flex items-center gap-1.5">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const clickable = done && !!onStepClick;
          const body = (
            <>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-caption font-bold tabular-nums transition-colors duration-150",
                  active && "border-foreground bg-foreground text-background",
                  done && "border-money-in bg-money-in text-money-in-foreground",
                  !active && !done && "border-border bg-card text-muted-foreground"
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "truncate text-body-sm font-semibold",
                  active ? "text-foreground" : "text-muted-foreground",
                  !active && "max-sm:sr-only"
                )}
              >
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.id} className={cn("flex min-w-0 items-center gap-1.5", active && "shrink-0")} aria-current={active ? "step" : undefined}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(s.id)}
                  className="flex min-h-11 min-w-0 items-center gap-2 rounded-control px-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  {body}
                  <span className="sr-only"> (volver a este paso)</span>
                </button>
              ) : (
                <span className="flex min-h-11 min-w-0 items-center gap-2 px-1">{body}</span>
              )}
              {i < steps.length - 1 && <span aria-hidden className={cn("h-0.5 w-4 shrink-0 rounded-full sm:w-6", done ? "bg-money-in" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
