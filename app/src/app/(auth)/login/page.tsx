import type { Metadata } from "next";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Panel de Monky
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inicia sesión para gestionar pedidos y solicitudes.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
