import { z } from "zod";
import { DELIVERY_PROVIDERS, SERVICE_TYPES } from "@/lib/counter-order";

/** La base vuelve a validar todo (create/update_counter_order, M06-T01). */
const uuid = (message: string) => z.uuid({ message });
const text = (max: number, message: string) => z.string().trim().max(max, message).optional();

export const counterAddressSchema = z.object({
  colonia: text(200, "Máximo 200 caracteres"),
  calle: text(200, "Máximo 200 caracteres"),
  numero: text(200, "Máximo 200 caracteres"),
  entre_calles: text(200, "Máximo 200 caracteres"),
  referencias: text(200, "Máximo 200 caracteres"),
});

const orderFields = {
  serviceType: z.enum(SERVICE_TYPES, { message: "Elige el tipo de pedido" }),
  customerName: text(80, "El nombre admite hasta 80 caracteres"),
  customerPhone: text(20, "El teléfono no es válido"),
  deliveryProvider: z.enum(DELIVERY_PROVIDERS, { message: "Elige el servicio de entrega" }).optional(),
  externalOrderId: text(60, "El ID de la plataforma admite hasta 60 caracteres"),
  deliveryAddress: counterAddressSchema.optional(),
  shippingCost: z.number().min(0).max(99999.99, "El costo de envío no es válido").optional(),
  generalComment: text(300, "El comentario admite hasta 300 caracteres"),
};

export const counterOrderItemSchema = z.object({
  productId: uuid("Producto inválido"),
  variantId: uuid("Variante inválida").optional(),
  quantity: z.number().int("Cantidad inválida").min(1, "La cantidad mínima es 1").max(99, "La cantidad máxima es 99"),
  notes: text(200, "La nota del producto admite hasta 200 caracteres"),
  modifiers: z
    .array(z.object({ optionId: uuid("Opción inválida"), qty: z.number().int().min(1).max(99).optional() }))
    .max(30, "Demasiadas personalizaciones")
    .optional(),
});

export const createCounterOrderSchema = z.object({
  ...orderFields,
  items: z.array(counterOrderItemSchema).min(1, "Agrega al menos un producto").max(50, "Máximo 50 líneas"),
  payLater: z.boolean(),
  clientRequestId: uuid("Falta la clave de idempotencia"),
});

export const updateCounterOrderSchema = z.object({
  orderId: uuid("Pedido inválido"),
  /** Parche completo de los campos editables (null borra). */
  changes: z.object({
    service_type: orderFields.serviceType,
    delivery_provider: z.enum(DELIVERY_PROVIDERS).nullable(),
    external_order_id: z.string().trim().max(60).nullable(),
    customer_name: z.string().trim().max(80).nullable(),
    customer_phone: z.string().trim().max(20).nullable(),
    delivery_address: counterAddressSchema.nullable(),
    shipping_cost: z.number().min(0).max(99999.99).nullable(),
    general_comment: z.string().trim().max(300).nullable(),
  }),
  confirmTotalIncrease: z.boolean().optional(),
});

export type CreateCounterOrderInput = z.input<typeof createCounterOrderSchema>;
export type UpdateCounterOrderInput = z.input<typeof updateCounterOrderSchema>;
