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
    <main className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px] rounded-card border border-border bg-card px-7 py-8 shadow-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid size-10 place-items-center rounded-control bg-primary text-body font-semibold text-primary-foreground">
            M
          </span>
          <p className="text-meta font-medium text-muted-foreground">Monky</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Panel de Monky
          </h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Inicia sesión para gestionar pedidos y solicitudes.
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginNotice />
        </Suspense>
        <LoginForm />
      </div>
    </main>
  );
}
