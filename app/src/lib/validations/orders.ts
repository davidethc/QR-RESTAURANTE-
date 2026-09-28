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
