import { z } from "zod";

/**
 * Un solo formulario cubre los dos casos: si "desde" y "hasta" son
 * iguales, se crea una mesa. Separarlos en dos formularios distintos
 * obligaría al dueño a elegir antes de escribir nada.
 *
 * Los `<input type="number">` entregan cadenas: ver `tableNumber`.
 */
/**
 * An empty field arrives as "" and `z.coerce` would turn it into 0, which
 * showed "empieza en 1" before the owner typed anything. Empty becomes
 * "missing" instead, with its own message.
 */
const tableNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ message: "Escribe el número de la mesa." })
    .int("Debe ser un número entero.")
    .min(1, "El número de mesa empieza en 1.")
);

export const createTablesSchema = z
  .object({
    fromNumber: tableNumber,
    toNumber: tableNumber,
  name: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
  })
  .refine((v) => v.toNumber >= v.fromNumber, {
    message: "El número final no puede ser menor que el inicial.",
    path: ["toNumber"],
  })
  .refine((v) => v.toNumber - v.fromNumber + 1 <= 50, {
    message: "Máximo 50 mesas por vez.",
    path: ["toNumber"],
  });

export type CreateTablesInput = z.input<typeof createTablesSchema>;
export type CreateTablesValues = z.output<typeof createTablesSchema>;

/** Number the next table should get: one after the highest existing table. */
export function nextTableNumber(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/** First number of the range that already belongs to a table, or null. */
export function firstTakenNumber(existing: readonly number[], from: number, to: number): number | null {
  const taken = existing.filter((n) => n >= from && n <= to);
  return taken.length === 0 ? null : Math.min(...taken);
}
