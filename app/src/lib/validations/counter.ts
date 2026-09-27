import { z } from "zod";

/**
 * Venta de mostrador (para llevar). La base vuelve a validar todo
 * (create_counter_sale / cancel_counter_sale, migración C5) y es la única
 * que pone precios; esto da mensajes claros antes del viaje de red.
 * Los topes coinciden con los de la RPC.
 */

export const COUNTER_MAX_LINES = 100;
export const COUNTER_MAX_QUANTITY = 999;
export const COUNTER_LABEL_MAX = 40;
export const COUNTER_NOTES_MAX = 500;

const uuid = (message = "Identificador inválido") => z.uuid({ message });

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : undefined));

export const counterSaleItemSchema = z.object({
  productId: uuid("Producto inválido"),
  quantity: z.coerce
    .number({ message: "Cantidad inválida." })
    .int("La cantidad debe ser un número entero.")
    .min(1, "La cantidad mínima es 1.")
    .max(COUNTER_MAX_QUANTITY, `La cantidad máxima es ${COUNTER_MAX_QUANTITY}.`),
  notes: optionalText(200, "La nota del producto admite hasta 200 caracteres."),
});

export const createCounterSaleSchema = z.object({
  items: z
    .array(counterSaleItemSchema)
    .min(1, "Agrega al menos un producto.")
    .max(COUNTER_MAX_LINES, `Máximo ${COUNTER_MAX_LINES} líneas por venta.`),
  notes: optionalText(COUNTER_NOTES_MAX, `Las notas admiten hasta ${COUNTER_NOTES_MAX} caracteres.`),
  customerLabel: optionalText(COUNTER_LABEL_MAX, `El nombre admite hasta ${COUNTER_LABEL_MAX} caracteres.`),
  /** La genera el cliente al abrir el formulario y se reutiliza en reintentos. */
  idempotencyKey: uuid("Falta la clave de idempotencia"),
  restaurantId: uuid("Restaurante inválido").optional(),
});

export const cancelCounterSaleSchema = z.object({
  billId: uuid("Venta inválida"),
  reason: z.string().trim().min(3, "Escribe el motivo de la cancelación (mínimo 3 caracteres).").max(200, "Máximo 200 caracteres."),
});

export type CounterSaleItemInput = z.input<typeof counterSaleItemSchema>;
export type CreateCounterSaleInput = z.input<typeof createCounterSaleSchema>;
export type CancelCounterSaleInput = z.input<typeof cancelCounterSaleSchema>;
