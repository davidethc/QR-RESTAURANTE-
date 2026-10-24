import { describe, expect, it } from "vitest";
import {
  cartFingerprint,
  cartToOnlineItems,
  composeOnlineOrderMessage,
  deliverySettingsSchema,
  enabledMethods,
  formatCountdown,
  isValidCustomerPhone,
  normalizeWhatsappNumber,
  orderLabel,
  parseDbHint,
  parseMoneyInput,
  pauseSchema,
  paymentMethodSettingsSchema,
  placeOnlineOrderSchema,
  trackingIndex,
  whatsappLink,
} from "./digital-menu";
import type { CartItem, PublicProduct } from "@/types/menu";
import type { OnlineOrder } from "@/types/digital-menu";

const P1 = "11111111-1111-4111-8111-111111111111";
const V1 = "22222222-2222-4222-8222-222222222222";
const O1 = "33333333-3333-4333-8333-333333333333";
const RID = "44444444-4444-4444-8444-444444444444";

const product = (id: string): PublicProduct => ({
  id,
  name: "Café",
  description: null,
  price: 2.5,
  image_url: null,
  available: true,
  featured: false,
  position: 0,
  paired_drink: null,
});

describe("cartToOnlineItems", () => {
  it("maps variant, notes and modifiers; omits empty fields and qty 1", () => {
    const items: CartItem[] = [
      {
        product: product(P1),
        quantity: 2,
        notes: "sin azúcar",
        subtotal: 6,
        unitPrice: 3,
        variantId: V1,
        modifierPicks: [
          { optionId: O1, qty: 1 },
          { optionId: O1, qty: 3 },
        ],
      },
      { product: product(P1), quantity: 1, notes: "", subtotal: 2.5 },
    ];
    expect(cartToOnlineItems(items)).toEqual([
      {
        product_id: P1,
        variant_id: V1,
        quantity: 2,
        notes: "sin azúcar",
        modifiers: [{ option_id: O1 }, { option_id: O1, qty: 3 }],
      },
      { product_id: P1, quantity: 1 },
    ]);
  });

  it("fingerprint changes with service type and content", () => {
    const items: CartItem[] = [{ product: product(P1), quantity: 1, notes: "", subtotal: 2.5 }];
    expect(cartFingerprint("delivery", items)).not.toBe(cartFingerprint("pickup", items));
    expect(cartFingerprint("pickup", items)).not.toBe(
      cartFingerprint("pickup", [{ ...items[0], quantity: 2, subtotal: 5 }])
    );
  });
});

describe("phones", () => {
  it("normalizes WhatsApp numbers to E.164 like the database", () => {
    expect(normalizeWhatsappNumber("+593 99 123-4567")).toBe("+593991234567");
    expect(normalizeWhatsappNumber("(+52) 55 1234 5678")).toBe("+525512345678");
    expect(normalizeWhatsappNumber("0991234567")).toBeNull();
    expect(normalizeWhatsappNumber("+0991234567")).toBeNull();
  });
  it("validates customer phones with the M06 rule", () => {
    expect(isValidCustomerPhone("099 123 4567")).toBe(true);
    expect(isValidCustomerPhone("+593991234567")).toBe(true);
    expect(isValidCustomerPhone("12ab")).toBe(false);
    expect(isValidCustomerPhone("12345")).toBe(false);
  });
  it("builds wa.me links with digits only", () => {
    expect(whatsappLink("+593 99 123 4567", "Hola y adiós")).toBe("https://wa.me/593991234567?text=Hola%20y%20adi%C3%B3s");
    expect(whatsappLink(null, "x")).toBeNull();
  });
});

describe("parseDbHint", () => {
  it("reads field, state and rate limit hints", () => {
    expect(parseDbHint("field=delivery_address.calle")).toEqual({ field: "delivery_address.calle" });
    expect(parseDbHint("state=paused")).toEqual({ state: "paused" });
    expect(parseDbHint("rate_limit=phone")).toEqual({ rateLimit: "phone" });
    expect(parseDbHint(null)).toEqual({});
    expect(parseDbHint("garbage")).toEqual({});
  });
});

describe("formatting", () => {
  it("formats countdowns and clamps negatives", () => {
    expect(formatCountdown(65_000)).toBe("01:05");
    expect(formatCountdown(3_900_000)).toBe("1 h 05 min");
    expect(formatCountdown(-5)).toBe("00:00");
  });
  it("labels orders by folio, then short code", () => {
    expect(orderLabel({ folio: 12, short_code: "AB" })).toBe("#12");
    expect(orderLabel({ folio: null, shortCode: "AB12" })).toBe("#AB12");
  });
  it("parses money as typed", () => {
    expect(parseMoneyInput("3,50")).toBe(3.5);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("3.505")).toBeNaN();
    expect(parseMoneyInput("-1")).toBeNaN();
  });
  it("orders tracking steps and lists enabled methods", () => {
    expect(trackingIndex("preparing")).toBe(2);
    expect(trackingIndex("expired")).toBe(-1);
    expect(enabledMethods({ cash: false, card: true, transfer: true, bank: null })).toEqual(["card", "transfer"]);
    expect(enabledMethods(undefined)).toEqual(["cash"]);
  });
});

const order: OnlineOrder = {
  order_id: P1,
  short_code: "K7",
  folio: 41,
  service_type: "delivery",
  tracking_token: V1,
  step: "new",
  created_at: "2026-10-23T12:00:00Z",
  confirmed_at: null,
  expires_at: "2026-10-23T12:30:00Z",
  customer_name: "Ana QA",
  preferred_payment_method: "cash",
  pays_with_amount: 20,
  general_comment: "Tocar el timbre",
  subtotal: 7.25,
  promo_discount_total: 2.75,
  shipping_cost: null,
  shipping_pending: true,
  total: 7.25,
  restaurant: { name: "Monky QA", slug: "monky-qa", logo_url: null, whatsapp_number: "+593990000000" },
  items: [
    {
      product_name: "Café",
      variant_name: "Grande",
      quantity: 2,
      unit_price: 2.5,
      list_subtotal: 5,
      promo_discount: 2.75,
      subtotal: 2.25,
      notes: "sin azúcar",
      promotions: ["2x1"],
      options: [{ name: "Leche", value_name: "Avena", qty: 1, price_modifier: 0.5 }],
    },
  ],
};

describe("composeOnlineOrderMessage", () => {
  it("includes number, customer, address, net line totals, pending shipping and payment", () => {
    const text = composeOnlineOrderMessage(order, {
      phone: "099 123 4567",
      address: { calle: "Av. Siempre Viva", numero: "742", colonia: "Centro", referencias: "Casa azul", lat: -2.1, lng: -79.9 },
    });
    expect(text).toContain("Pedido #41 · A domicilio");
    expect(text).toContain("Nombre: Ana QA");
    expect(text).toContain("Teléfono: 099 123 4567");
    expect(text).toContain("Dirección: Av. Siempre Viva 742, Centro");
    expect(text).toContain("Referencias: Casa azul");
    expect(text).toContain("maps.google.com/?q=-2.1,-79.9");
    expect(text).toMatch(/2 × Café \(Grande\) — \$\s?2,25/);
    expect(text).toContain("Leche: Avena");
    expect(text).toContain("Envío: por cotizar");
    expect(text).toMatch(/Total: \$\s?7,25 \+ envío/);
    expect(text).toMatch(/Pago: Efectivo \(pagaré con \$\s?20,00\)/);
  });
  it("pickup has no address or shipping lines", () => {
    const text = composeOnlineOrderMessage({ ...order, service_type: "pickup", shipping_pending: false }, {
      address: { calle: "X", numero: "1", colonia: "Y" },
    });
    expect(text).toContain("Para recoger");
    expect(text).not.toContain("Dirección");
    expect(text).not.toContain("Envío");
  });
});

describe("placeOnlineOrderSchema", () => {
  const base = {
    slug: "monky-qa",
    serviceType: "pickup" as const,
    items: [{ product_id: P1, quantity: 1 }],
    clientRequestId: V1,
    customerName: "Ana",
    customerPhone: "0991234567",
    paymentMethod: "cash" as const,
  };
  it("accepts a valid pickup order", () => {
    expect(placeOnlineOrderSchema.safeParse(base).success).toBe(true);
  });
  it("delivery requires an address", () => {
    const r = placeOnlineOrderSchema.safeParse({ ...base, serviceType: "delivery" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["address"]);
  });
  it("'pagaré con' only with cash; empty cart rejected", () => {
    expect(placeOnlineOrderSchema.safeParse({ ...base, paymentMethod: "card", paysWithAmount: 10 }).success).toBe(false);
    expect(placeOnlineOrderSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });
  it("rejects a missing payment method", () => {
    const r = placeOnlineOrderSchema.safeParse({ ...base, paymentMethod: undefined });
    expect(r.error?.issues[0].message).toBe("Elige un método de pago.");
  });
});

describe("settings schemas", () => {
  it("delivery settings need amounts when enabled and max ≥ min", () => {
    const ok = {
      free_shipping_enabled: false,
      free_shipping_min_amount: null,
      min_purchase_enabled: true,
      min_purchase_amount: 10,
      delivery_time_min: 25,
      delivery_time_max: 45,
      pickup_time: 15,
      unconfirmed_ttl_minutes: 30,
    };
    expect(deliverySettingsSchema.safeParse(ok).success).toBe(true);
    expect(deliverySettingsSchema.safeParse({ ...ok, free_shipping_enabled: true }).success).toBe(false);
    expect(deliverySettingsSchema.safeParse({ ...ok, delivery_time_max: 10 }).success).toBe(false);
    expect(deliverySettingsSchema.safeParse({ ...ok, unconfirmed_ttl_minutes: 2 }).success).toBe(false);
  });
  it("payment methods keep one enabled and need bank data for transfer", () => {
    const ok = {
      cash_enabled: true,
      card_enabled: false,
      transfer_enabled: false,
      bank_holder: "",
      bank_name: "",
      bank_account: "",
      bank_card_number: "",
    };
    const parsed = paymentMethodSettingsSchema.safeParse(ok);
    expect(parsed.success && parsed.data.bank_holder).toBeNull();
    expect(paymentMethodSettingsSchema.safeParse({ ...ok, cash_enabled: false }).success).toBe(false);
    expect(paymentMethodSettingsSchema.safeParse({ ...ok, transfer_enabled: true }).success).toBe(false);
    expect(
      paymentMethodSettingsSchema.safeParse({
        ...ok,
        transfer_enabled: true,
        bank_holder: "QA",
        bank_name: "Banco",
        bank_card_number: "4111",
      }).success
    ).toBe(true);
  });
  it("custom pause needs an end after the start", () => {
    expect(pauseSchema.safeParse({ restaurantId: RID, preset: "1h" }).success).toBe(true);
    expect(pauseSchema.safeParse({ restaurantId: RID, preset: "custom" }).success).toBe(false);
    expect(
      pauseSchema.safeParse({
        restaurantId: RID,
        preset: "custom",
        from: "2026-10-24T10:00:00-05:00",
        until: "2026-10-24T09:00:00-05:00",
      }).success
    ).toBe(false);
  });
});
