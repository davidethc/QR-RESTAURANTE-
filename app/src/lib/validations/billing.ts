import { z } from "zod";
import {
  DISCOUNT_KIND,
  PAYMENT_METHOD,
  SPLIT_MODE,
} from "@/config/constants";

/**
 * Validaciones de cobro. La base vuelve a validar todo (RPCs de M10); esto
 * existe para dar mensajes claros antes del viaje de red. Los montos se
 * redondean al centavo aquí para que lo que se ve sea lo que se manda.
 */

const uuid = (message = "Identificador inválido") => z.uuid({ message });

const money = (label: string) =>
  z.coerce
    .number({ message: `${label}: escribe un monto válido.` })
    .finite(`${label}: escribe un monto válido.`)
    .max(99_999_999.99, `${label}: monto demasiado grande.`)
    .transform((v) => Math.round(v * 100) / 100);

const reason = (label = "el motivo") =>
  z.string().trim().min(3, `Escribe ${label} (mínimo 3 caracteres).`).max(200, "Máximo 200 caracteres.");

export const openBillSchema = z.object({
  tableSessionId: uuid("Sesión de mesa inválida"),
});

export const billIdSchema = z.object({
  billId: uuid("Cuenta inválida"),
});

export const restaurantIdSchema = z.object({
  restaurantId: uuid("Restaurante inválido"),
});

export const setBillSplitSchema = z
  .object({
    billId: uuid("Cuenta inválida"),
    mode: z.enum(SPLIT_MODE),
    parts: z.coerce.number().int("Las partes deben ser un número entero.").min(1).max(50).default(1),
  })
  .refine((v) => v.mode !== SPLIT_MODE.EQUAL || v.parts >= 2, {
    message: "Las partes iguales van de 2 a 50.",
    path: ["parts"],
  });

export const applyDiscountSchema = z
  .object({
    billId: uuid("Cuenta inválida"),
    kind: z.enum(DISCOUNT_KIND),
    value: money("Descuento").refine((v) => v > 0, "El descuento debe ser mayor que cero."),
    reason: reason("el motivo del descuento"),
    orderItemId: uuid("Ítem inválido").optional(),
  })
  .refine((v) => v.kind !== DISCOUNT_KIND.PERCENT || v.value <= 100, {
    message: "Un porcentaje no puede superar el 100%.",
    path: ["value"],
  });

export const removeDiscountSchema = z.object({
  discountId: uuid("Descuento inválido"),
  reason: z.string().trim().max(200, "Máximo 200 caracteres.").optional(),
});

export const paymentItemSchema = z.object({
  order_item_id: uuid("Ítem inválido"),
  quantity: z.coerce.number().int().min(1),
});

export const recordPaymentSchema = z
  .object({
    billId: uuid("Cuenta inválida"),
    method: z.enum(PAYMENT_METHOD),
    amount: money("Monto").refine((v) => v > 0, "El monto debe ser mayor que cero."),
    tipAmount: money("Propina").refine((v) => v >= 0, "La propina no puede ser negativa.").default(0),
    tenderedAmount: money("Efectivo recibido").optional(),
    reference: z.string().trim().max(100, "Máximo 100 caracteres.").optional(),
    cardType: z.string().trim().max(40, "Máximo 40 caracteres.").optional(),
    items: z.array(paymentItemSchema).max(200).optional(),
    /** La genera el cliente al abrir el formulario y se reutiliza en reintentos. */
    idempotencyKey: uuid("Falta la clave de idempotencia"),
    cashSessionId: uuid("Caja inválida").optional(),
    autoClose: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.method !== PAYMENT_METHOD.CASH ||
      v.tenderedAmount === undefined ||
      Math.round(v.tenderedAmount * 100) >= Math.round((v.amount + v.tipAmount) * 100),
    { message: "El efectivo recibido no alcanza.", path: ["tenderedAmount"] }
  );

export const voidPaymentSchema = z.object({
  paymentId: uuid("Pago inválido"),
  reason: reason("el motivo de la anulación"),
});

export const voidBillSchema = z.object({
  billId: uuid("Cuenta inválida"),
  reason: reason("el motivo de la anulación"),
});

export const forceCloseTableSchema = z.object({
  tableId: uuid("Mesa inválida"),
  reason: reason("el motivo del cierre forzado"),
});

export type SetBillSplitInput = z.input<typeof setBillSplitSchema>;
export type ApplyDiscountInput = z.input<typeof applyDiscountSchema>;
export type RemoveDiscountInput = z.input<typeof removeDiscountSchema>;
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type VoidPaymentInput = z.input<typeof voidPaymentSchema>;
export type VoidBillInput = z.input<typeof voidBillSchema>;
export type ForceCloseTableInput = z.input<typeof forceCloseTableSchema>;
