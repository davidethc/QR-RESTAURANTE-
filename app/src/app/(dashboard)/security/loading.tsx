import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function SecurityLoading() {
  return <main aria-busy="true"><PageHeader title="Historial de seguridad" />
    <div role="status" className="flex flex-col gap-4 px-4 md:px-8"><span className="sr-only">Cargando historial…</span>
      <Skeleton className="h-40 rounded-card" />
      {[0, 1, 2].map((key) => <Skeleton key={key} className="h-28 rounded-card" />)}
    </div>
  </main>;
}
