/**
 * What the customer sees the instant they tap, while the server builds
 * the menu. It mirrors the real shape (brand strip, search, category chips,
 * category blocks) instead of a centered spinner: the eye recognizes the
 * structure, the wait feels shorter, and nothing jumps when content lands.
 */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-background" aria-busy="true" aria-label="Cargando la carta">
      <header className="bg-primary-dark">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-white/20" />
          <div className="h-5 w-40 animate-pulse rounded bg-white/20" />
        </div>
      </header>

      <div className="flex flex-col gap-6 pb-44">
        <div className="border-b border-border">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3">
            <div className="h-12 animate-pulse rounded-xl border border-border bg-card" />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-hidden px-4">
              {[96, 120, 104, 132, 92].map((w, i) => (
                <div
                  key={i}
                  style={{ width: w }}
                  className="h-11 shrink-0 animate-pulse rounded-full border border-border bg-card"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Categories start closed, so this is literally what will paint. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="size-12 shrink-0 animate-pulse rounded-xl bg-muted" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
