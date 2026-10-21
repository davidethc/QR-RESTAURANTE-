import { Skeleton } from "@/components/ui/skeleton";

export function SchedulesLoading() {
  return (
    <div role="status" aria-label="Cargando horarios" aria-busy="true" className="space-y-6">
      <span className="sr-only">Cargando horarios…</span>
      <div aria-hidden="true" className="space-y-4">
        <Skeleton className="h-11 w-48" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
