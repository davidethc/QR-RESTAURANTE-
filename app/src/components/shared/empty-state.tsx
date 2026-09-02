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
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
