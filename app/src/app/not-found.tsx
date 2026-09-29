import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6">
      <EmptyState
        icon={Compass}
        title="Página no encontrada"
        description="El enlace no existe o ya no está disponible. Si llegaste escaneando un QR, pide ayuda al personal del restaurante."
      />
    </main>
  );
}
