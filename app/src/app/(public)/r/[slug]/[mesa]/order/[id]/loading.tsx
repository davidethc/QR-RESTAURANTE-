/**
 * Immediate feedback after tapping an order. Mirrors OrderTracker: title,
 * status hero, the four steps and the detail card.
 */
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 bg-background px-4 py-5"
      aria-busy="true"
      aria-label="Cargando tu pedido"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-7 w-24 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="h-[84px] animate-pulse rounded-2xl border border-border bg-card" />
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-9 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-44 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
    </main>
  );
}
