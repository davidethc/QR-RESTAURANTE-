import { z } from "zod";
import { formatPrice } from "@/lib/utils";
import { MAX_LINE_MODIFIERS, MAX_LINE_QUANTITY, MAX_NOTES_LENGTH, MAX_ORDER_LINES } from "@/lib/validations/orders";
import type { CartItem } from "@/types/menu";
import type {
  ChannelPaymentMethods,
  OnlineAddress,
  OnlineOrder,
  OnlineOrderStep,
  OnlinePaymentMethod,
  OnlineServiceType,
  PausePreset,
  WhatsappVolume,
} from "@/types/digital-menu";

/**
 * M12 · Pure rules of the digital menu (delivery / pickup): labels, payload
 * building, validation and the WhatsApp hand-off text. The database prices
 * and validates again; nothing here decides money.
 */

export const SERVICE_LABELS: Record<OnlineServiceType, string> = {
  delivery: "A domicilio",
  pickup: "Para recoger",
};

export const PAYMENT_LABELS: Record<OnlinePaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

export const STEP_LABELS: Record<OnlineOrderStep, string> = {
  new: "Recibido",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  delivered: "Entregado",
  expired: "Vencido",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

export const VOLUME_LABELS: Record<WhatsappVolume, string> = {
  lt_50: "Menos de 50",
  "50_150": "50 a 150",
  "150_500": "150 a 500",
  gt_500: "Más de 500",
};

export const PAUSE_PRESETS: { value: Exclude<PausePreset, "custom">; label: string }[] = [
  { value: "15m", label: "15 min" },
  { value: "30m", label: "30 min" },
  { value: "45m", label: "45 min" },
  { value: "1h", label: "1 hora" },
  { value: "2h", label: "2 horas" },
  { value: "today", label: "Hoy" },
  { value: "indefinite", label: "Hasta reactivar" },
];

/** Customer-facing order of the happy path, used by the tracker. */
export const TRACKING_STEPS: OnlineOrderStep[] = ["new", "confirmed", "preparing", "ready", "delivered"];

export function trackingIndex(step: OnlineOrderStep): number {
  return TRACKING_STEPS.indexOf(step);
}

export function isFinalStep(step: OnlineOrderStep): boolean {
  return step === "delivered" || step === "expired" || step === "rejected" || step === "cancelled";
}

/** Payment methods enabled for a channel, in display order. */
export function enabledMethods(pm: ChannelPaymentMethods | undefined): OnlinePaymentMethod[] {
  if (!pm) return ["cash"];
  return (["cash", "card", "transfer"] as const).filter((m) => pm[m]);
}

/** `HINT 'field=x'`, `state=paused`, `rate_limit=phone` → structured. */
export function parseDbHint(hint: string | null | undefined): {
  field?: string;
  state?: string;
  rateLimit?: string;
} {
  if (!hint) return {};
  const [key, value] = hint.split("=", 2);
  if (!value) return {};
  if (key === "field") return { field: value };
  if (key === "state") return { state: value };
  if (key === "rate_limit") return { rateLimit: value };
  return {};
}

/** Cart lines → the `p_items` shape every order RPC takes. */
export function cartToOnlineItems(items: CartItem[]) {
  return items.map((item) => ({
    product_id: item.product.id,
    ...(item.variantId ? { variant_id: item.variantId } : {}),
    quantity: item.quantity,
    ...(item.notes ? { notes: item.notes } : {}),
    ...(item.modifierPicks && item.modifierPicks.length > 0
      ? { modifiers: item.modifierPicks.map((m) => ({ option_id: m.optionId, ...(m.qty > 1 ? { qty: m.qty } : {}) })) }
      : {}),
  }));
}

/** Stable key of the cart content, for idempotency and quote refreshes. */
export function cartFingerprint(serviceType: OnlineServiceType, items: CartItem[]): string {
  return JSON.stringify([serviceType, cartToOnlineItems(items)]);
}

/** Same rule as `set_digital_menu_whatsapp`: strip spaces/dashes/parens; E.164. */
export function normalizeWhatsappNumber(raw: string): string | null {
  const v = raw.replace(/[\s()-]/g, "");
  return /^\+[1-9][0-9]{6,14}$/.test(v) ? v : null;
}

/** Same rule as `m06_normalize_counter_fields` for customer phones. */
export function isValidCustomerPhone(raw: string): boolean {
  return /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/.test(raw.trim());
}

/** `wa.me` wants digits only. */
export function whatsappLink(number: string | null | undefined, text: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function formatAddress(a: Partial<OnlineAddress> | null | undefined): string {
  if (!a) return "";
  const street = [a.calle, a.numero].filter(Boolean).join(" ");
  return [street, a.colonia].filter(Boolean).join(", ");
}

/** "12:05" under an hour, "1 h 05 min" above; never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Order number shown to people: folio, then short code. */
export function orderLabel(o: { folio: number | null; short_code?: string | null; shortCode?: string | null }): string {
  if (o.folio) return `#${o.folio}`;
  const code = o.short_code ?? o.shortCode;
  return code ? `#${code}` : "";
}

/**
 * The WhatsApp message the customer sends to the restaurant after placing.
 * Phone and address never come back from the public RPCs, so the page passes
 * what the customer typed in this same browser (`contact`).
 */
export function composeOnlineOrderMessage(
  order: OnlineOrder,
  contact?: { phone?: string; address?: Partial<OnlineAddress> | null }
): string {
  const lines: string[] = [];
  lines.push(`Hola ${order.restaurant.name}, acabo de hacer un pedido en su menú digital.`);
  lines.push("");
  lines.push(`Pedido ${orderLabel(order)} · ${SERVICE_LABELS[order.service_type]}`);
  if (order.customer_name) lines.push(`Nombre: ${order.customer_name}`);
  if (contact?.phone) lines.push(`Teléfono: ${contact.phone}`);
  if (order.service_type === "delivery") {
    const address = formatAddress(contact?.address);
    if (address) lines.push(`Dirección: ${address}`);
    if (contact?.address?.entre_calles) lines.push(`Entre: ${contact.address.entre_calles}`);
    if (contact?.address?.referencias) lines.push(`Referencias: ${contact.address.referencias}`);
    if (contact?.address?.lat != null && contact.address.lng != null) {
      lines.push(`Ubicación: https://maps.google.com/?q=${contact.address.lat},${contact.address.lng}`);
    }
  }
  lines.push("");
  lines.push("Productos:");
  for (const item of order.items) {
    const variant = item.variant_name ? ` (${item.variant_name})` : "";
    lines.push(`• ${item.quantity} × ${item.product_name}${variant} — ${formatPrice(item.subtotal)}`);
    const extras = item.options.map((o) => (o.value_name ? `${o.name}: ${o.value_name}` : o.name)).filter(Boolean);
    if (extras.length > 0) lines.push(`   ${extras.join(", ")}`);
    if (item.notes) lines.push(`   Nota: ${item.notes}`);
  }
  if (order.general_comment) {
    lines.push("");
    lines.push(`Comentario: ${order.general_comment}`);
  }
  lines.push("");
  lines.push(`Productos: ${formatPrice(order.subtotal)}`);
  if (order.service_type === "delivery") {
    lines.push(
      order.shipping_pending
        ? "Envío: por cotizar"
        : `Envío: ${order.shipping_cost === 0 ? "gratis" : formatPrice(order.shipping_cost ?? 0)}`
    );
  }
  lines.push(`Total: ${formatPrice(order.total)}${order.shipping_pending ? " + envío" : ""}`);
  if (order.preferred_payment_method) {
    const pays =
      order.preferred_payment_method === "cash" && order.pays_with_amount
        ? ` (pagaré con ${formatPrice(order.pays_with_amount)})`
        : "";
    lines.push(`Pago: ${PAYMENT_LABELS[order.preferred_payment_method]}${pays}`);
  }
  return lines.join("\n");
}

/** Auto-reply text for WhatsApp Business that invites customers to the menu. */
export function businessAutoReply(restaurantName: string, url: string): string {
  return `¡Hola! Gracias por escribir a ${restaurantName}. Haz tu pedido aquí y lo preparamos más rápido: ${url}`;
}

// ───────────────────────────── Validation ──────────────────────────────

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const slugSchema = z.string().regex(SLUG_RE, "Restaurante no válido.");
export const serviceTypeSchema = z.enum(["delivery", "pickup"], { message: "Elige A domicilio o Para recoger." });
export const paymentMethodSchema = z.enum(["cash", "card", "transfer"], { message: "Elige un método de pago." });

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : undefined));

export const onlineItemSchema = z.object({
  product_id: z.uuid({ message: "Producto inválido." }),
  variant_id: z.uuid({ message: "Variante inválida." }).optional(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  modifiers: z
    .array(z.object({ option_id: z.uuid(), qty: z.number().int().min(1).max(MAX_LINE_QUANTITY).optional() }))
    .max(MAX_LINE_MODIFIERS)
    .optional(),
});

export const onlineItemsSchema = z
  .array(onlineItemSchema)
  .min(1, "Tu pedido está vacío.")
  .max(MAX_ORDER_LINES, `Un pedido admite hasta ${MAX_ORDER_LINES} productos distintos.`);

export const quoteSchema = z.object({
  slug: slugSchema,
  serviceType: serviceTypeSchema,
  items: onlineItemsSchema,
});

export const addressSchema = z.object({
  calle: z.string().trim().min(1, "Escribe la calle.").max(200),
  numero: z.string().trim().min(1, "Escribe el número.").max(200),
  colonia: z.string().trim().min(1, "Escribe el barrio o colonia.").max(200),
  entre_calles: optionalText(200, "Máximo 200 caracteres."),
  referencias: optionalText(200, "Máximo 200 caracteres."),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const placeOnlineOrderSchema = z
  .object({
    slug: slugSchema,
    serviceType: serviceTypeSchema,
    items: onlineItemsSchema,
    clientRequestId: z.uuid({ message: "Solicitud inválida. Intenta de nuevo." }),
    customerName: z.string().trim().min(1, "Escribe tu nombre.").max(80, "El nombre admite hasta 80 caracteres."),
    customerPhone: z
      .string()
      .trim()
      .min(1, "Escribe tu teléfono.")
      .refine(isValidCustomerPhone, "Revisa tu teléfono: solo números, por ejemplo 099 123 4567."),
    paymentMethod: paymentMethodSchema,
    address: addressSchema.optional(),
    paysWithAmount: z.number().positive("Escribe un monto válido.").max(99999.99).optional(),
    comment: optionalText(300, "El comentario admite hasta 300 caracteres."),
  })
  .superRefine((v, ctx) => {
    if (v.serviceType === "delivery" && !v.address) {
      ctx.addIssue({ code: "custom", path: ["address"], message: "Escribe la dirección de entrega." });
    }
    if (v.paysWithAmount !== undefined && v.paymentMethod !== "cash") {
      ctx.addIssue({ code: "custom", path: ["paysWithAmount"], message: '"Pagaré con" solo aplica al efectivo.' });
    }
  });

export type PlaceOnlineOrderInput = z.input<typeof placeOnlineOrderSchema>;

export const tokenSchema = z.uuid({ message: "Pedido no encontrado." });
export const idSchema = z.uuid({ message: "Dato inválido." });

export const whatsappSchema = z.object({
  restaurantId: idSchema,
  number: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = normalizeWhatsappNumber(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Escribe el número con código de país, por ejemplo +593 99 123 4567." });
        return z.NEVER;
      }
      return n;
    }),
  volume: z.enum(["lt_50", "50_150", "150_500", "gt_500"]).optional(),
});

export const pauseSchema = z
  .object({
    restaurantId: idSchema,
    preset: z.enum(["15m", "30m", "45m", "1h", "2h", "today", "indefinite", "custom"], {
      message: "Elige cuánto tiempo pausar.",
    }),
    from: z.iso.datetime({ offset: true }).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.preset === "custom" && !v.until) {
      ctx.addIssue({ code: "custom", path: ["until"], message: "Elige hasta cuándo pausar." });
    }
    if (v.preset === "custom" && v.until && v.from && Date.parse(v.until) <= Date.parse(v.from)) {
      ctx.addIssue({ code: "custom", path: ["until"], message: "El fin de la pausa debe ser posterior al inicio." });
    }
  });

const money = z.number().positive("Escribe un monto mayor a 0.").max(99999.99, "Monto demasiado alto.");
const minutes = z.number().int("Usa minutos enteros.").min(1, "Mínimo 1 minuto.").max(600, "Máximo 600 minutos.");

export const deliverySettingsSchema = z
  .object({
    free_shipping_enabled: z.boolean(),
    free_shipping_min_amount: money.nullable(),
    min_purchase_enabled: z.boolean(),
    min_purchase_amount: money.nullable(),
    delivery_time_min: minutes,
    delivery_time_max: minutes,
    pickup_time: minutes,
    unconfirmed_ttl_minutes: z.number().int().min(5, "Mínimo 5 minutos.").max(1440, "Máximo 1440 minutos."),
  })
  .superRefine((v, ctx) => {
    if (v.free_shipping_enabled && v.free_shipping_min_amount === null) {
      ctx.addIssue({ code: "custom", path: ["free_shipping_min_amount"], message: "Escribe desde qué monto el envío es gratis." });
    }
    if (v.min_purchase_enabled && v.min_purchase_amount === null) {
      ctx.addIssue({ code: "custom", path: ["min_purchase_amount"], message: "Escribe la compra mínima." });
    }
    if (v.delivery_time_max < v.delivery_time_min) {
      ctx.addIssue({ code: "custom", path: ["delivery_time_max"], message: "El máximo no puede ser menor que el mínimo." });
    }
  });

export type DeliverySettingsInput = z.input<typeof deliverySettingsSchema>;

const bankText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v ? v : null));

export const paymentMethodSettingsSchema = z
  .object({
    cash_enabled: z.boolean(),
    card_enabled: z.boolean(),
    transfer_enabled: z.boolean(),
    bank_holder: bankText(80),
    bank_name: bankText(80),
    bank_account: bankText(40),
    bank_card_number: bankText(25),
  })
  .superRefine((v, ctx) => {
    if (!v.cash_enabled && !v.card_enabled && !v.transfer_enabled) {
      ctx.addIssue({ code: "custom", path: ["cash_enabled"], message: "Deja al menos un método de pago activo." });
    }
    if (v.transfer_enabled && (!v.bank_holder || !v.bank_name || (!v.bank_account && !v.bank_card_number))) {
      ctx.addIssue({
        code: "custom",
        path: ["bank_holder"],
        message: "Para transferencia escribe titular, banco y cuenta o tarjeta.",
      });
    }
  });

export type PaymentMethodSettingsInput = z.input<typeof paymentMethodSettingsSchema>;

export const acceptOnlineOrderSchema = z.object({
  orderId: idSchema,
  shippingCost: z.number().min(0, "El envío no puede ser negativo.").max(99999.99).optional(),
});

export const rejectOnlineOrderSchema = z.object({
  orderId: idSchema,
  reason: optionalText(200, "El motivo admite hasta 200 caracteres."),
});

/** Parse a money text the way people type it ("3,50" or "3.50"). */
export function parseMoneyInput(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  if (!v) return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(v)) return Number.NaN;
  return Number(v);
}
