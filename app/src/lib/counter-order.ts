import { formatPrice } from "@/lib/utils";

/**
 * Lógica pura del pedido de mostrador (M06): validación por tipo (espejo de
 * m06_normalize_counter_fields, la base vuelve a validar), carga útil de la
 * RPC, texto de "Copiar pedido" y enlace de WhatsApp. Sin React ni red.
 */

export const SERVICE_TYPES = ["dine_in_no_table", "takeaway", "delivery"] as const;
export type CounterServiceType = (typeof SERVICE_TYPES)[number];

export const DELIVERY_PROVIDERS = ["own", "uber_eats", "rappi", "didi_food"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

export const SERVICE_TYPE_LABEL: Record<CounterServiceType, string> = {
  dine_in_no_table: "Para comer aquí",
  takeaway: "Para llevar",
  delivery: "Domicilio",
};

export const SERVICE_TYPE_HELP: Record<CounterServiceType, string> = {
  dine_in_no_table: "Pedido para consumir en el local, sin una mesa asignada.",
  takeaway: "Productos envueltos.",
  delivery: "Servicio a domicilio propio o de terceros.",
};

export const PROVIDER_LABEL: Record<DeliveryProvider, string> = {
  own: "Domicilio propio",
  uber_eats: "Uber Eats",
  rappi: "Rappi",
  didi_food: "DiDi Food",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "efectivo",
  card: "tarjeta",
  transfer: "transferencia",
};

export interface CounterAddress {
  colonia?: string;
  calle?: string;
  numero?: string;
  entre_calles?: string;
  referencias?: string;
}

/** Valores del formulario (todo texto, como lo escribe el usuario). */
export interface CounterFormValues {
  serviceType: CounterServiceType | "";
  customerName: string;
  customerPhone: string;
  provider: DeliveryProvider | "";
  externalOrderId: string;
  colonia: string;
  calle: string;
  numero: string;
  entreCalles: string;
  referencias: string;
  /** Vacío = "Por cotizar". */
  shippingCost: string;
  generalComment: string;
}

export const EMPTY_FORM: CounterFormValues = {
  serviceType: "",
  customerName: "",
  customerPhone: "",
  provider: "",
  externalOrderId: "",
  colonia: "",
  calle: "",
  numero: "",
  entreCalles: "",
  referencias: "",
  shippingCost: "",
  generalComment: "",
};

export type FieldErrors = Partial<Record<string, string>>;

const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;

/** null = vacío ("Por cotizar"); NaN = no es un monto válido. */
export function parseShipping(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Claves de error = nombres de campo de la RPC (service_type, customer_name…). */
export function validateCounterForm(v: CounterFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!v.serviceType) {
    errors.service_type = "Elige el tipo de pedido";
    return errors;
  }
  const name = v.customerName.trim();
  if (name.length > 80) errors.customer_name = "El nombre admite hasta 80 caracteres";
  if (v.generalComment.trim().length > 300) {
    errors.general_comment = "El comentario admite hasta 300 caracteres";
  }
  if (v.serviceType !== "delivery") return errors;

  if (!v.provider) {
    errors.delivery_provider = "Elige el servicio de entrega";
    return errors;
  }
  if (v.provider !== "own") {
    const ext = v.externalOrderId.trim();
    if (!ext) errors.external_order_id = "Escribe el ID del pedido de la plataforma";
    else if (ext.length > 60) errors.external_order_id = "El ID de la plataforma admite hasta 60 caracteres";
    return errors;
  }
  if (!name) errors.customer_name = "Escribe el nombre del cliente";
  const phone = v.customerPhone.trim();
  if (!phone) errors.customer_phone = "Escribe el teléfono del cliente";
  else if (!PHONE_RE.test(phone)) errors.customer_phone = "El teléfono no es válido";
  if (!v.calle.trim()) errors["delivery_address.calle"] = "Falta la calle";
  if (!v.numero.trim()) errors["delivery_address.numero"] = "Falta el número";
  if (!v.colonia.trim()) errors["delivery_address.colonia"] = "Falta la colonia";
  for (const [k, val] of [
    ["colonia", v.colonia],
    ["calle", v.calle],
    ["numero", v.numero],
    ["entre_calles", v.entreCalles],
    ["referencias", v.referencias],
  ] as const) {
    if (val.trim().length > 200) errors[`delivery_address.${k}`] = "Máximo 200 caracteres";
  }
  const ship = parseShipping(v.shippingCost);
  if (ship !== null && (Number.isNaN(ship) || ship < 0 || ship > 99999.99)) {
    errors.shipping_cost = "El costo de envío no es válido";
  }
  return errors;
}

/** Extrae el campo de un HINT "field=customer_phone" de la base. */
export function parseFieldHint(hint: string | null | undefined): string | null {
  const m = /^field=([a-z_.]+)$/.exec((hint ?? "").trim());
  return m ? m[1] : null;
}

export function isConfirmRequired(message: string | null | undefined): boolean {
  return (message ?? "").startsWith("CONFIRM_REQUIRED");
}

/** Mensaje de CONFIRM_REQUIRED sin el prefijo técnico. */
export function confirmMessage(message: string): string {
  return message.replace(/^CONFIRM_REQUIRED:\s*/, "");
}

/** Campos de la RPC a partir del formulario (solo los que aplican al tipo). */
export function buildCounterFields(v: CounterFormValues) {
  const own = v.serviceType === "delivery" && v.provider === "own";
  const platform = v.serviceType === "delivery" && v.provider !== "own" && v.provider !== "";
  const clean = (s: string) => s.trim() || undefined;
  const address: CounterAddress | undefined = own
    ? {
        colonia: clean(v.colonia),
        calle: clean(v.calle),
        numero: clean(v.numero),
        entre_calles: clean(v.entreCalles),
        referencias: clean(v.referencias),
      }
    : undefined;
  const ship = own ? parseShipping(v.shippingCost) : null;
  return {
    serviceType: v.serviceType as CounterServiceType,
    customerName: v.serviceType === "delivery" && platform ? undefined : clean(v.customerName),
    customerPhone: own ? clean(v.customerPhone) : undefined,
    deliveryProvider: v.serviceType === "delivery" ? (v.provider as DeliveryProvider) : undefined,
    externalOrderId: platform ? clean(v.externalOrderId) : undefined,
    deliveryAddress: address,
    shippingCost: ship === null || Number.isNaN(ship) ? undefined : ship,
    generalComment: clean(v.generalComment),
  };
}

/* ---------------------------- Copiar pedido ----------------------------- */

export interface CounterOrderView {
  id: string;
  orderNumber: number;
  folio: number;
  serviceType: CounterServiceType;
  status: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryProvider: DeliveryProvider | null;
  externalOrderId: string | null;
  deliveryAddress: CounterAddress | null;
  generalComment: string | null;
  shippingCost: number | null;
  subtotal: number;
  total: number;
  preferredPaymentMethod: string | null;
  paysWithAmount: number | null;
  tableSessionId: string | null;
  items: { name: string; quantity: number; subtotal: number; notes: string | null }[];
}

/** Texto para el repartidor (formato de la spec M06 §9). */
export function buildOrderCopyText(o: CounterOrderView): string {
  const blocks: string[] = [];
  const who: string[] = [];
  if (o.customerName) who.push(`Nombre: ${o.customerName}`);
  if (o.customerPhone) who.push(`Celular: ${o.customerPhone}`);
  if (o.externalOrderId) {
    const prov = o.deliveryProvider ? PROVIDER_LABEL[o.deliveryProvider] : "Plataforma";
    who.push(`${prov}, pedido: ${o.externalOrderId}`);
  }
  if (who.length) blocks.push(who.join("\n"));

  const a = o.deliveryAddress;
  if (a) {
    const lines: string[] = [];
    if (a.calle) lines.push(`Calle: ${a.calle}`);
    if (a.numero) lines.push(`Número: ${a.numero}`);
    if (a.colonia) lines.push(`Colonia: ${a.colonia}`);
    if (a.entre_calles) lines.push(`Entre calles: ${a.entre_calles}`);
    if (a.referencias) lines.push(`Referencias: ${a.referencias}`);
    if (lines.length) blocks.push(lines.join("\n"));
  }

  if (o.items.length) {
    blocks.push(
      o.items
        .map((i) => `${i.quantity} x ${i.name}${i.notes ? ` (${i.notes})` : ""} - ${formatPrice(i.subtotal)}`)
        .join("\n")
    );
  }

  const money = [`Productos: ${formatPrice(o.subtotal)}`];
  if (o.serviceType === "delivery" && o.deliveryProvider === "own") {
    money.push(`Envío: ${o.shippingCost === null ? "Por cotizar" : formatPrice(o.shippingCost)}`);
  }
  money.push(`Total: ${formatPrice(o.total)}`);
  blocks.push(money.join("\n"));

  if (o.generalComment) blocks.push(`Comentario: ${o.generalComment}`);

  const pay: string[] = [];
  if (o.preferredPaymentMethod) {
    pay.push(`Método de pago elegido: ${PAYMENT_METHOD_LABEL[o.preferredPaymentMethod] ?? o.preferredPaymentMethod}`);
  }
  if (o.paysWithAmount !== null) pay.push(`Cliente pagará con: ${formatPrice(o.paysWithAmount)}`);
  if (pay.length) blocks.push(pay.join("\n"));

  return blocks.join("\n\n");
}

/** Texto de "Mostrar datos de envío" (lo que se copia). */
export function buildShippingCopyText(a: CounterAddress | null): string {
  if (!a) return "";
  return [
    a.calle && `Calle: ${a.calle}`,
    a.numero && `Número: ${a.numero}`,
    a.colonia && `Colonia: ${a.colonia}`,
    a.entre_calles && `Entre calles: ${a.entre_calles}`,
    a.referencias && `Referencias: ${a.referencias}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** wa.me con el teléfono tal cual (ya lleva código de país); null sin teléfono válido. */
export function buildContactUrl(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}`;
}
