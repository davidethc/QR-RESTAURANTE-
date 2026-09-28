export default function MesaPendientePage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Esta mesa tiene una cuenta pendiente</h1>
      <p className="max-w-xs text-muted-foreground">
        Antes de empezar un pedido nuevo, el personal tiene que cerrar la
        cuenta anterior. Pide ayuda a un mesero.
      </p>
    </main>
  );
}
