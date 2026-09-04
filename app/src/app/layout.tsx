import type { Metadata } from "next";
import "./globals.css";
import { Fraunces, Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { GooeyToaster } from "@/components/ui/goey-toaster";

/**
 * Fraunces para títulos, nombres de plato y precios: es una serif de
 * contornos suaves, con carácter de rótulo pintado a mano — la carta
 * de una cafetería de comida casera no debería leerse como un panel
 * de banco. Figtree para el resto de la interfaz: humanista, ancha,
 * legible en un celular a distancia de brazo y con luz de local.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
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
        fraunces.variable
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
