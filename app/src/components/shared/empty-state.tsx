import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";

/**
 * "NO HAY PEDIDOS — Todo está al día ✓". El vacío debe transmitir
 * tranquilidad, no error (wireframes de mesero y cocina). Se usa en
 * cualquier listado del panel que puede llegar a estar vacío.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = CheckCircle2,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-14 text-center">
      <span className="mb-2 flex size-10 items-center justify-center rounded-control bg-secondary text-muted-foreground">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <p className="font-display text-body font-semibold leading-tight text-foreground">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-meta leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
