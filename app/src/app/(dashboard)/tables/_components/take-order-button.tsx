"use client";

import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Abre la carta de esta mesa para que el mesero tome el pedido él mismo,
 * cuando el cliente prefiere dictárselo en vez de usar su teléfono.
 *
 * Es la acción primaria de la tarjeta de mesa (por eso lleva `clay`): sin
 * "Pidió la cuenta" de por medio, tomar el pedido es lo único que el
 * mesero hace realmente desde acá con frecuencia — el resto (QR, liberar)
 * es mantenimiento ocasional.
 */
export function TakeOrderButton({ tableId }: { tableId: string }) {
  const router = useRouter();

  return (
    // Igual que TableQrDialog y ReleaseTableButton: la card entera es un
    // <Link> a /orders, así que hay que impedir que ese enlace se dispare.
    <div onClick={(e) => e.preventDefault()}>
      <Button
        onClick={() => router.push(`/tables/${tableId}/order`)}
        className="clay clay-primary h-11 w-full rounded-full text-[14px] font-semibold"
      >
        <ClipboardList className="h-4 w-4" /> Tomar pedido
      </Button>
    </div>
  );
}
