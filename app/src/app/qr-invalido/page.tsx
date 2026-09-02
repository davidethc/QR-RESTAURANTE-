export default function QrInvalidoPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">QR no válido</h1>
      <p className="max-w-xs text-muted-foreground">
        Este código no corresponde a una mesa activa. Consulta con el
        personal del restaurante.
      </p>
    </main>
  );
}
