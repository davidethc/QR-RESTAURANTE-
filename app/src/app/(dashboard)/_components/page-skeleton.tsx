import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto instantáneo para los `loading.tsx` del panel: sale en cuanto
 * se toca el enlace, mientras el servidor termina la página. El layout (nav)
 * ya está en pantalla; esto solo ocupa el lugar del contenido.
 */
export function PageSkeleton({
  title,
  variant = "list",
}: {
  title: string;
  variant?: "list" | "grid";
}) {
  const items = variant === "grid" ? 8 : 4;
  return (
    <main aria-busy="true" aria-label={`Cargando ${title}`}>
      <div className="px-4 pb-6 pt-8 md:px-8">
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
      </div>
      <div className="px-4 pb-12 md:px-8">
        <Skeleton className="mb-4 h-10 w-full max-w-md" />
        <div
          className={
            variant === "grid"
              ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              : "flex flex-col gap-3"
          }
        >
          {Array.from({ length: items }, (_, i) => (
            <Skeleton key={i} className={variant === "grid" ? "h-32 rounded-card" : "h-24 rounded-card"} />
          ))}
        </div>
      </div>
    </main>
  );
}
