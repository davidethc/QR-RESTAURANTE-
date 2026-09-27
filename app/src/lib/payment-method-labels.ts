import type { PaymentMethod } from "@/config/constants";

/**
 * Nombre en español de cada método de pago. Un solo lugar para no repetir
 * este mapa en la hoja de cobro, el formulario de pago y el ticket
 * imprimible — los tres necesitan mostrar exactamente el mismo texto.
 */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};
