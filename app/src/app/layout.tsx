import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { GooeyToaster } from "@/components/ui/goey-toaster";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Monky",
  description: "Sistema digital de atención y pedidos para restaurantes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col">
        {children}
        <GooeyToaster position="top-center" bounce={0.4} showProgress closeButton />
      </body>
    </html>
  );
}
