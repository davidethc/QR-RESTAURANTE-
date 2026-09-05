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
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <p className="font-display text-[17px] font-semibold leading-tight text-foreground">
        {title}
      </p>
      {description && (
        <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
