import { z } from "zod";

/**
 * Cancelar una venta de mostrador (cancel_counter_sale, migración C5). Los
 * pedidos de mostrador se crean con create_counter_order
 * (validations/counter-order.ts). La base vuelve a validar todo.
 */

const uuid = (message = "Identificador inválido") => z.uuid({ message });

export const cancelCounterSaleSchema = z.object({
  billId: uuid("Venta inválida"),
  reason: z.string().trim().min(3, "Escribe el motivo de la cancelación (mínimo 3 caracteres).").max(200, "Máximo 200 caracteres."),
});

export type CancelCounterSaleInput = z.input<typeof cancelCounterSaleSchema>;
