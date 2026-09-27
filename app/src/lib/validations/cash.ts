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

/** Conteo por método: CASH obligatorio, el resto opcional. */
export const cashCountsSchema = z
  .partialRecord(z.enum(PAYMENT_METHOD), money("Conteo"))
  .refine((counts) => counts.CASH !== undefined, {
    message: "Falta el conteo de efectivo.",
    path: ["CASH"],
  });

export const closeCashSessionSchema = z.object({
  cashSessionId: z.uuid({ message: "Turno de caja inválido" }),
  counts: cashCountsSchema,
  notes: z.string().trim().max(500, "Máximo 500 caracteres.").optional(),
});

export type OpenCashSessionInput = z.input<typeof openCashSessionSchema>;
export type AddCashMovementInput = z.input<typeof addCashMovementSchema>;
export type CloseCashSessionInput = z.input<typeof closeCashSessionSchema>;
