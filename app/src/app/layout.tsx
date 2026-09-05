import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { GooeyToaster } from "@/components/ui/goey-toaster";

/**
 * Bricolage Grotesque para títulos, nombres de plato y precios.
 *
 * Sustituye a Fraunces, que estaba aquí antes por su aire de rótulo
 * pintado. Dos razones para el cambio: Fraunces está catalogada como
 * parte de la firma tipográfica de interfaz generada por IA en 2026, y
 * su trazo suave sobre texto oscuro reforzaba justo la sensación de
 * "apagado" que había que quitar. Bricolage tiene más densidad de tinta
 * en peso 700, así que los titulares se ven gruesos y no delicados.
 *
 * Figtree para el resto: humanista, ancha, legible en un celular a
 * distancia de brazo y con luz de local.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "wdth"],
});
const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Monky",
  description: "Sistema digital de atención y pedidos para restaurantes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={cn(
        "h-full antialiased font-sans",
        figtree.variable,
        bricolage.variable
      )}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <GooeyToaster
          position="top-center"
          bounce={0.4}
          showProgress
          closeButton
          duration={2000}
        />
      </body>
    </html>
  );
}
