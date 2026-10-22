import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  buildContactUrl,
  buildCounterFields,
  buildOrderCopyText,
  parseFieldHint,
  parseShipping,
  validateCounterForm,
  type CounterFormValues,
  type CounterOrderView,
} from "./counter-order";

const own: CounterFormValues = {
  ...EMPTY_FORM,
  serviceType: "delivery",
  provider: "own",
  customerName: "Ana",
  customerPhone: "+593 991234567",
  calle: "Calle Falsa",
  numero: "123",
  colonia: "Centro",
};

describe("validateCounterForm", () => {
  it("exige el tipo", () => {
    expect(validateCounterForm(EMPTY_FORM).service_type).toBe("Elige el tipo de pedido");
  });
  it("comer aquí y para llevar no piden nada más", () => {
    expect(validateCounterForm({ ...EMPTY_FORM, serviceType: "dine_in_no_table" })).toEqual({});
    expect(validateCounterForm({ ...EMPTY_FORM, serviceType: "takeaway" })).toEqual({});
  });
  it("domicilio exige servicio de entrega", () => {
    expect(validateCounterForm({ ...EMPTY_FORM, serviceType: "delivery" }).delivery_provider).toBeTruthy();
  });
  it("plataforma externa solo pide el ID", () => {
    const v = { ...EMPTY_FORM, serviceType: "delivery" as const, provider: "rappi" as const };
    expect(validateCounterForm(v).external_order_id).toBeTruthy();
    expect(validateCounterForm({ ...v, externalOrderId: "R-1" })).toEqual({});
  });
  it("domicilio propio exige nombre, teléfono y dirección", () => {
    const e = validateCounterForm({ ...EMPTY_FORM, serviceType: "delivery", provider: "own" });
    expect(Object.keys(e).sort()).toEqual([
      "customer_name",
      "customer_phone",
      "delivery_address.calle",
      "delivery_address.colonia",
      "delivery_address.numero",
    ]);
    expect(validateCounterForm(own)).toEqual({});
  });
  it("rechaza teléfono y envío inválidos", () => {
    expect(validateCounterForm({ ...own, customerPhone: "abc" }).customer_phone).toBeTruthy();
    expect(validateCounterForm({ ...own, shippingCost: "-3" }).shipping_cost).toBeTruthy();
  });
});

describe("helpers", () => {
  it("parseShipping", () => {
    expect(parseShipping("")).toBeNull();
    expect(parseShipping("2,5")).toBe(2.5);
    expect(parseShipping("x")).toBeNaN();
  });
  it("parseFieldHint", () => {
    expect(parseFieldHint("field=customer_phone")).toBe("customer_phone");
    expect(parseFieldHint("field=delivery_address.calle")).toBe("delivery_address.calle");
    expect(parseFieldHint("confirm=p_confirm_total_increase")).toBeNull();
  });
  it("buildCounterFields omite lo que no aplica", () => {
    const f = buildCounterFields({ ...own, shippingCost: "2" });
    expect(f.shippingCost).toBe(2);
    expect(f.deliveryAddress?.calle).toBe("Calle Falsa");
    const t = buildCounterFields({ ...EMPTY_FORM, serviceType: "takeaway", customerName: "Luis", calle: "x" });
    expect(t.deliveryAddress).toBeUndefined();
    expect(t.customerName).toBe("Luis");
  });
  it("buildContactUrl", () => {
    expect(buildContactUrl("+593 99 123 4567")).toBe("https://wa.me/593991234567");
    expect(buildContactUrl(null)).toBeNull();
  });
});

describe("buildOrderCopyText", () => {
  const order: CounterOrderView = {
    id: "1",
    orderNumber: 1,
    folio: 1,
    serviceType: "delivery",
    status: "PREPARING",
    createdAt: "2026-10-22T10:00:00Z",
    customerName: "Cliente de ejemplo",
    customerPhone: "+000 00000000",
    deliveryProvider: "own",
    externalOrderId: null,
    deliveryAddress: { calle: "Calle Falsa", numero: "123", colonia: "Centro", referencias: "Frente a la plaza" },
    generalComment: null,
    shippingCost: 2,
    subtotal: 22.5,
    total: 24.5,
    preferredPaymentMethod: "cash",
    paysWithAmount: 30,
    tableSessionId: null,
    items: [],
  };
  it("sigue el formato de la spec", () => {
    const text = buildOrderCopyText(order);
    expect(text).toContain("Nombre: Cliente de ejemplo\nCelular: +000 00000000");
    expect(text).toContain("Calle: Calle Falsa\nNúmero: 123\nColonia: Centro\nReferencias: Frente a la plaza");
    expect(text).toMatch(/Productos: .*22,50[\s\S]*Envío: .*2,00[\s\S]*Total: .*24,50/);
    expect(text).toContain("Método de pago elegido: efectivo\nCliente pagará con:");
  });
  it("envío sin cotizar", () => {
    expect(buildOrderCopyText({ ...order, shippingCost: null })).toContain("Envío: Por cotizar");
  });
});
