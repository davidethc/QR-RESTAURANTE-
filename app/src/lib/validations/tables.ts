import { z } from "zod";

/**
 * Un solo formulario cubre los dos casos: si "desde" y "hasta" son
 * iguales, se crea una mesa. Separarlos en dos formularios distintos
 * obligaría al dueño a elegir antes de escribir nada.
 *
 * `coerce` porque los `<input type="number">` entregan cadenas.
 */
export const createTablesSchema = z
  .object({
    fromNumber: z.coerce
      .number({ message: "Escribe un número." })
      .int("Debe ser un número entero.")
      .min(1, "El número de mesa empieza en 1."),
    toNumber: z.coerce
      .number({ message: "Escribe un número." })
      .int("Debe ser un número entero.")
      .min(1, "El número de mesa empieza en 1."),
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
