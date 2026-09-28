"use client";

import { motion } from "framer-motion";
import { PackageCheck } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { RejectDialog } from "./reject-dialog";
import { acceptOrder } from "@/lib/actions/orders";
import type { StaffOrder } from "@/types/staff";

/**
 * Tarjeta de pedido del panel.
 *
 * Jerarquía pensada para leerse de lejos y con prisa: primero DE QUÉ
 * MESA es (serif de display, el dato con el que el mesero camina),
 * luego qué lleva, y al final el precio en granate. El volumen (clay)
 * queda reservado al botón que hace avanzar el pedido — uno solo por
 * tarjeta — para que sea obvio dónde tocar sin leer.
 *
 * El mesero solo acepta/rechaza (PENDING) y entrega (ACCEPTED, PREPARING
 * o READY). "Preparar" y "Marcar listo" son de la cocina.
 */
export function OrderCard({
  order,
  onDone,
  onDeliver,
  confirmNotReady = false,
}: {
  order: StaffOrder;
  /** Se llama al completar una acción con éxito. El tablero lo usa
   *  para recargar sin depender de que llegue el evento propio. */
  onDone?: () => void;
  /** "Entregado": el tablero lo difiere unos segundos con "Deshacer". */
  onDeliver?: () => void;
  /** La cocina de este restaurante marca "Listo" y este pedido todavía
   *  no lo está: se pregunta antes de entregar. */
  confirmNotReady?: boolean;
}) {
  const canDeliver =
    order.status === "ACCEPTED" ||
    order.status === "PREPARING" ||
    order.status === "READY";
  const deliverClassName =
    "clay clay-primary mt-3 h-12 w-full rounded-full text-[15px] font-semibold";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="shadow-card rounded-2xl border border-border/70 bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-[17px] font-semibold leading-tight text-foreground">
            {order.place_label ?? order.table_name ?? `Mesa ${order.table_number}`}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-tight text-muted-foreground">
              #{order.order_number}
            </span>
            <ElapsedTimer since={order.created_at} warnAfterMinutes={10} />
          </div>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-3">
        {order.items.map((item) => (
          <p
            key={item.id}
            className="text-[15px] leading-snug text-foreground"
          >
            <span className="font-display font-semibold tabular-nums text-primary">
              {item.quantity}×
            </span>{" "}
            {item.product_name}
            {item.notes && (
              <span className="block text-[13px] italic leading-snug text-muted-foreground">
                {item.notes}
              </span>
            )}
          </p>
        ))}
      </div>

      {order.notes && (
        <p className="mt-2.5 rounded-xl bg-secondary/70 px-3 py-2 text-[13px] italic leading-snug text-muted-foreground">
          Nota: {order.notes}
        </p>
      )}

      <p className="font-display mt-3 text-lg font-semibold tabular-nums text-wine">
        {formatPrice(order.total)}
      </p>

      {order.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <ActionButton
            onSuccess={onDone}
            action={() => acceptOrder(order.id)}
            successMessage="Pedido aceptado — en preparación"
            className="clay clay-primary h-12 flex-1 rounded-full text-[15px] font-semibold"
          >
            Aceptar
          </ActionButton>
          <RejectDialog orderId={order.id} onDone={onDone} />
        </div>
      )}

      {canDeliver && onDeliver &&
        (confirmNotReady && order.status !== "READY" ? (
          <ConfirmDialog
            trigger={
              <Button className={deliverClassName}>
                <PackageCheck data-icon="inline-start" aria-hidden />
                Entregado
              </Button>
            }
            title="Cocina aún no lo marcó listo"
            description="¿Ya lo llevaste a la mesa? Se quitará de la pantalla de cocina."
            confirmLabel="Sí, ya lo entregué"
            cancelLabel="Todavía no"
            action={async () => {
              onDeliver();
              return { ok: true, data: undefined };
            }}
          />
        ) : (
          <Button className={deliverClassName} onClick={onDeliver}>
            <PackageCheck data-icon="inline-start" aria-hidden />
            Entregado
          </Button>
        ))}
    </motion.div>
  );
}
