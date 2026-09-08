/**
 * Feedback inmediato al tocar "Ver pedido". Imita la forma del
 * OrderTracker: la fila de pasos y la tarjeta del pedido.
 */
export default function Loading() {
  return (
    <main className="min-h-full px-4 py-6" aria-busy="true" aria-label="Cargando tu pedido">
      <div className="mb-6 h-6 w-44 animate-pulse rounded bg-muted" />
      <div className="mb-8 flex items-center justify-between gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
            <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </main>
  );
}
