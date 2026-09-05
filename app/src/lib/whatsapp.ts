import type { CartItem } from "@/types/menu";
import { formatPrice } from "@/lib/utils";

/**
 * Enlace a WhatsApp del restaurante.
 *
 * El número sale de Configuración (`restaurants.phone`), nunca fijo en
 * el código: cada restaurante tiene el suyo y el dueño lo cambia desde
 * su panel sin tocar nada.
 *
 * Ecuador guarda los celulares como "09XXXXXXXX". WhatsApp exige el
 * formato internacional sin signos ni ceros de tronco, así que
 * "0991646999" tiene que viajar como "593991646999". Si el dueño ya
 * escribió el número con código de país (+593… o 593…), se respeta.
 */
const ECUADOR_COUNTRY_CODE = "593";

export function toWhatsappNumber(rawPhone: string | null): string | null {
  if (!rawPhone) return null;

  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 9) return null;

  if (digits.startsWith(ECUADOR_COUNTRY_CODE)) return digits;
  if (digits.startsWith("0")) return ECUADOR_COUNTRY_CODE + digits.slice(1);
  return ECUADOR_COUNTRY_CODE + digits;
}

/**
 * Mensaje del pedido, ya redactado. El restaurante lo recibe como un
 * texto legible y lo gestiona igual que un pedido por teléfono — sin
 * tener que preguntar de vuelta qué quería exactamente.
 */
export function composeOrderMessage(
  restaurantName: string,
  items: CartItem[],
  total: number
): string {
  const lines = items.map((item) => {
    const notes = item.notes ? ` (${item.notes})` : "";
    return `• ${item.quantity} × ${item.product.name}${notes} — ${formatPrice(
      item.subtotal
    )}`;
  });

  return [
    `Hola ${restaurantName}, quisiera hacer este pedido:`,
    "",
    ...lines,
    "",
    `Total: ${formatPrice(total)}`,
  ].join("\n");
}

export function buildWhatsappUrl(
  phone: string | null,
  message: string
): string | null {
  const number = toWhatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
