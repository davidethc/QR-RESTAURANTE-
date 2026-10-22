import { z } from "zod";

/**
 * Forma de un pedido antes de mandarlo a `create_customer_order` /
 * `create_staff_order`. La base vuelve a validar precios, disponibilidad y
 * restaurante; esto corta payloads absurdos (cantidades negativas, mil
 * líneas, notas de un megabyte) antes del viaje a Postgres.
 */

export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 99;
export const MAX_NOTES_LENGTH = 200;

const notes = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH, `Las indicaciones admiten hasta ${MAX_NOTES_LENGTH} caracteres.`)
  .optional()
  .transform((v) => (v ? v : null));

export const orderLineSchema = z.object({
  productId: z.uuid({ message: "Producto inválido." }),
  /** Variante elegida (M01). Sin ella la base cobra products.price. */
  variantId: z.uuid({ message: "Variante inválida." }).optional(),
  quantity: z
    .number({ message: "Cantidad inválida." })
    .int("La cantidad debe ser un número entero.")
    .min(1, "La cantidad mínima es 1.")
    .max(MAX_LINE_QUANTITY, `La cantidad máxima por plato es ${MAX_LINE_QUANTITY}.`),
  notes,
});

const orderBase = {
  items: z
    .array(orderLineSchema)
    .min(1, "El pedido está vacío.")
    .max(MAX_ORDER_LINES, `Un pedido admite hasta ${MAX_ORDER_LINES} platos distintos.`),
  notes,
  clientRequestId: z.uuid({ message: "Solicitud inválida. Intenta de nuevo." }),
};

export const customerOrderSchema = z.object(orderBase);

export const staffOrderSchema = z.object({
  ...orderBase,
  tableId: z.uuid({ message: "Mesa inválida." }),
});

export type CustomerOrderInput = z.input<typeof customerOrderSchema>;
export type StaffOrderInput = z.input<typeof staffOrderSchema>;

export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 200;

const reason = z
  .string({ message: "Escribe el motivo." })
  .trim()
  .min(MIN_REASON_LENGTH, `Escribe el motivo (mínimo ${MIN_REASON_LENGTH} caracteres).`)
  .max(MAX_REASON_LENGTH, `El motivo admite hasta ${MAX_REASON_LENGTH} caracteres.`);

export const openTableSchema = z.object({
  tableId: z.uuid({ message: "Mesa inválida." }),
});

/** Comanda nueva. Sin `orderId` es el primer "Guardar" de la mesa (`tableId`). */
export const addTicketSchema = z
  .object({
    orderId: z.uuid({ message: "Pedido inválido." }).nullable(),
    tableId: z.uuid({ message: "Mesa inválida." }).optional(),
    items: orderBase.items,
    requestId: z.uuid({ message: "Solicitud inválida. Intenta de nuevo." }),
  })
  .refine((v) => v.orderId !== null || v.tableId !== undefined, {
    message: "Indica el pedido o la mesa.",
  });

export const cancelOrderItemSchema = z.object({
  orderItemId: z.uuid({ message: "Producto inválido." }),
  reason,
});

export const cancelOrderWithReasonSchema = z.object({
  orderId: z.uuid({ message: "Pedido inválido." }),
  reason,
});

export const transferOrderSchema = z.object({
  orderId: z.uuid({ message: "Pedido inválido." }),
  targetTableId: z.uuid({ message: "Mesa destino inválida." }),
});

export type AddTicketInput = z.input<typeof addTicketSchema>;
