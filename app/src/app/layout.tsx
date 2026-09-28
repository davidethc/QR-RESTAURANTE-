import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

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
        {/* Sonner, no goey-toast: este layout lo carga TODA la app,
            incluido el celular del comensal, y goey-toast arrastra
            framer-motion (~60 KB comprimidos) para pintar un "Plato
            agregado". Los avisos del personal que sí justifican ese
            peso montan su propio <GooeyToaster> en el layout del
            panel. Ver src/lib/notifications-staff.ts. */}
        <Toaster
          position="top-center"
          closeButton
          duration={2000}
          richColors
        />
      </body>
    </html>
  );
}
