import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./_components/login-form";
import { LoginNotice } from "./_components/login-notice";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <main
      data-caja
      className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10 sm:px-6"
    >
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div className="flex items-center gap-3.5 border-b border-border px-6 py-5 sm:px-7">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-foreground text-title font-bold text-background">
            M
          </span>
          <div className="min-w-0">
            <h1 className="text-title-lg font-bold leading-tight text-foreground">
              Panel de Monky
            </h1>
            <p className="mt-0.5 text-body-sm text-muted-foreground">
              Inicia sesión para gestionar pedidos y solicitudes.
            </p>
          </div>
        </div>
        <div className="px-6 py-6 sm:px-7">
        <Suspense fallback={null}>
          <LoginNotice />
        </Suspense>
        <LoginForm />
        </div>
      </div>
    </main>
  );
}
