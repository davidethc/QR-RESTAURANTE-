/**
 * Lo que el comensal ve en el instante en que toca, mientras el servidor
 * arma la carta. Antes no existía este archivo: al pulsar no pasaba
 * absolutamente nada —la pantalla anterior seguía congelada— hasta que
 * llegaba el HTML completo, y en el 3G de un local a mediodía eso son
 * los "segundos" que se sentían como que la app no respondía.
 *
 * Imita la forma real de la carta (franja verde, buscador, píldoras de
 * categoría) en vez de un spinner centrado: el ojo reconoce la
 * estructura y la espera se percibe más corta, y además no hay salto de
 * layout cuando llega el contenido de verdad.
 */
export default function Loading() {
  return (
    <main className="min-h-full" aria-busy="true" aria-label="Cargando la carta">
      {/* Franja del encabezado: mismo alto y color que MenuHeader. */}
      <header className="bg-primary-dark flex items-center gap-3 px-4 py-3.5">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/20" />
        <div className="h-5 w-40 animate-pulse rounded bg-white/20" />
      </header>

      <div className="flex flex-col gap-7 pb-40">
        {/* Buscador + píldoras: mismas medidas que la barra sticky real. */}
        <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3">
          <div className="h-11 animate-pulse rounded-full bg-secondary/80" />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-hidden px-4">
            {[72, 96, 84, 110, 68].map((w, i) => (
              <div
                key={i}
                style={{ width: w }}
                className="h-11 shrink-0 animate-pulse rounded-full bg-primary-soft"
              />
            ))}
          </div>
        </div>

        {/* Cabeceras de categoría: la carta arranca con todas cerradas,
            así que esto es literalmente lo que se va a pintar. */}
        <div className="flex flex-col gap-3 px-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border/50 px-3.5 py-3.5"
            >
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
