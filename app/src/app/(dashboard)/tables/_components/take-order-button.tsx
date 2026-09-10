"use client";

import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Abre la carta de esta mesa para que el mesero tome el pedido él mismo,
 * cuando el cliente prefiere dictárselo en vez de usar su teléfono.
 */
export function TakeOrderButton({ tableId }: { tableId: string }) {
  const router = useRouter();

  return (
    // Igual que TableQrDialog y ReleaseTableButton: la card entera es un
    // <Link> a /orders, así que hay que impedir que ese enlace se dispare.
    <div onClick={(e) => e.preventDefault()}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/tables/${tableId}/order`)}
        className="h-9 w-full rounded-full border-border/70 text-[13px] font-semibold"
      >
        <ClipboardList className="h-4 w-4" /> Tomar pedido
      </Button>
    </div>
  );
}
