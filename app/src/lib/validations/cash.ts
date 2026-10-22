import { z } from "zod";
import {
  CASH_MOVEMENT_REASON,
  CASH_MOVEMENT_TYPE,
  PAYMENT_METHOD,
} from "@/config/constants";

const money = (label: string) =>
  z.coerce
    .number({ message: `${label}: escribe un monto válido.` })
    .finite(`${label}: escribe un monto válido.`)
    .min(0, `${label}: no puede ser negativo.`)
    .max(99_999_999.99, `${label}: monto demasiado grande.`)
    .transform((v) => Math.round(v * 100) / 100);

export const cashSessionIdSchema = z.object({
  cashSessionId: z.uuid({ message: "Turno de caja inválido" }),
});

export const openCashSessionSchema = z.object({
  registerId: z.uuid({ message: "Caja inválida" }),
  openingFloat: money("Fondo inicial").default(0),
});

export const addCashMovementSchema = z
  .object({
    cashSessionId: z.uuid({ message: "Turno de caja inválido" }),
    type: z.enum(CASH_MOVEMENT_TYPE),
    reason: z.enum(CASH_MOVEMENT_REASON),
    amount: money("Monto").refine((v) => v > 0, "El monto debe ser mayor que cero."),
    description: z.string().trim().max(300, "Máximo 300 caracteres.").optional(),
    idempotencyKey: z.uuid({ message: "Falta la clave de idempotencia" }),
  })
  .refine(
    (v) => v.reason !== CASH_MOVEMENT_REASON.OTHER || (v.description?.length ?? 0) >= 3,
    { message: "Describe el motivo del movimiento.", path: ["description"] }
  );

/**
 * Conteo por método: CASH obligatorio, el resto opcional (un método vacío
 * significa "no se contó", no "se contó cero"). El campo llega del form con
 * `setValueAs: v => v === "" ? undefined : Number(v)`, pero React Hook Form
 * igual deja la clave presente con valor `undefined` en vez de omitirla — y
 * `z.partialRecord` de Zod v4 SÍ valida claves presentes aunque su valor sea
 * `undefined`, produciendo NaN. Envolver cada valor en `.optional()` hace que
 * una clave presente-pero-`undefined` se trate como ausente (válida) en vez
 * de forzar la coerción a número.
 */
export const cashCountsSchema = z
  .partialRecord(z.enum(PAYMENT_METHOD), money("Conteo").optional())
  .refine((counts) => counts.CASH !== undefined, {
    message: "Falta el conteo de efectivo.",
    path: ["CASH"],
  });

export const closeCashSessionSchema = z.object({
  cashSessionId: z.uuid({ message: "Turno de caja inválido" }),
  counts: cashCountsSchema,
  notes: z.string().trim().max(500, "Máximo 500 caracteres.").optional(),
});

export const cashCutSchema = z
  .object({
    cashSessionId: z.uuid({ message: "Turno de caja inválido" }),
    counts: cashCountsSchema,
    cashFloatLeft: money("Fondo de caja").default(0),
    notes: z.string().trim().max(500, "Máximo 500 caracteres.").optional(),
    skipPendingOrders: z.boolean().default(false),
  })
  .refine((v) => v.cashFloatLeft <= (v.counts.CASH ?? 0), {
    message: "El fondo que queda no puede ser mayor que el efectivo contado.",
    path: ["cashFloatLeft"],
  });

export const cashListSchema = z.object({
  registerId: z.uuid().optional(),
  cashSessionId: z.uuid().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type CashCutInput = z.input<typeof cashCutSchema>;
export type OpenCashSessionInput = z.input<typeof openCashSessionSchema>;
export type AddCashMovementInput = z.input<typeof addCashMovementSchema>;
export type CloseCashSessionInput = z.input<typeof closeCashSessionSchema>;
