import { Geist } from "next/font/google";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza.
export const instant = false;

/**
 * Tipografía del panel (misma familia que `(dashboard)/layout.tsx`).
 * Se carga aquí y no en el layout raíz para que la carta del comensal
 * no la descargue.
 */
const geist = Geist({ subsets: ["latin"], display: "swap" });

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="admin" className="flex min-h-dvh flex-col bg-background">
      <style>{`:root{--font-geist:${geist.style.fontFamily}}`}</style>
      {children}
    </div>
  );
}
