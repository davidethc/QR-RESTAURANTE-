import { describe, expect, it } from "vitest";
import {
  customerOrderSchema,
  MAX_LINE_QUANTITY,
  MAX_NOTES_LENGTH,
  MAX_ORDER_LINES,
  staffOrderSchema,
} from "./orders";

const PRODUCT = "9d23ed2c-4147-442c-a11d-93f726ab897e";
const REQUEST = "3f2b8c1e-6d4a-4f7b-9a2e-1c5d8e7f6a3b";
const TABLE = "b7e4a1c2-3d5f-4e6a-8b9c-0d1e2f3a4b5c";

const line = (overrides: Record<string, unknown> = {}) => ({
  productId: PRODUCT,
  quantity: 1,
  ...overrides,
});

describe("customerOrderSchema", () => {
  it("acepta un pedido válido y normaliza notas vacías a null", () => {
    const parsed = customerOrderSchema.parse({
      items: [line({ notes: "  " }), line({ quantity: 3, notes: " sin cebolla " })],
      clientRequestId: REQUEST,
    });
    expect(parsed.items[0].notes).toBeNull();
    expect(parsed.items[1].notes).toBe("sin cebolla");
    expect(parsed.notes).toBeNull();
    expect(parsed.clientRequestId).toBe(REQUEST);
  });

  it.each([0, -1, MAX_LINE_QUANTITY + 1, 1.5])("rechaza cantidad %s", (quantity) => {
    const result = customerOrderSchema.safeParse({ items: [line({ quantity })], clientRequestId: REQUEST });
    expect(result.success).toBe(false);
  });

  it("acepta los bordes 1 y 99", () => {
    for (const quantity of [1, MAX_LINE_QUANTITY]) {
      expect(
        customerOrderSchema.safeParse({ items: [line({ quantity })], clientRequestId: REQUEST }).success
      ).toBe(true);
    }
  });

  it("rechaza un pedido vacío", () => {
    expect(customerOrderSchema.safeParse({ items: [], clientRequestId: REQUEST }).success).toBe(false);
  });

  it(`acepta ${MAX_ORDER_LINES} líneas y rechaza ${MAX_ORDER_LINES + 1}`, () => {
    const ok = Array.from({ length: MAX_ORDER_LINES }, () => line());
    expect(customerOrderSchema.safeParse({ items: ok, clientRequestId: REQUEST }).success).toBe(true);
    const tooMany = [...ok, line()];
    expect(customerOrderSchema.safeParse({ items: tooMany, clientRequestId: REQUEST }).success).toBe(false);
  });

  it(`limita las notas a ${MAX_NOTES_LENGTH} caracteres (por línea y del pedido)`, () => {
    const exact = "a".repeat(MAX_NOTES_LENGTH);
    const long = "a".repeat(MAX_NOTES_LENGTH + 1);
    expect(
      customerOrderSchema.safeParse({ items: [line({ notes: exact })], notes: exact, clientRequestId: REQUEST })
        .success
    ).toBe(true);
    expect(
      customerOrderSchema.safeParse({ items: [line({ notes: long })], clientRequestId: REQUEST }).success
    ).toBe(false);
    expect(
      customerOrderSchema.safeParse({ items: [line()], notes: long, clientRequestId: REQUEST }).success
    ).toBe(false);
  });

  it("exige clientRequestId UUID y productId UUID", () => {
    expect(customerOrderSchema.safeParse({ items: [line()] }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [line()], clientRequestId: "abc" }).success).toBe(false);
    expect(
      customerOrderSchema.safeParse({ items: [line({ productId: "1" })], clientRequestId: REQUEST }).success
    ).toBe(false);
  });
});

describe("staffOrderSchema", () => {
  it("exige la mesa además del pedido", () => {
    expect(staffOrderSchema.safeParse({ items: [line()], clientRequestId: REQUEST }).success).toBe(false);
    expect(
      staffOrderSchema.safeParse({ tableId: TABLE, items: [line()], clientRequestId: REQUEST }).success
    ).toBe(true);
  });

  it("aplica las mismas reglas de cantidad", () => {
    expect(
      staffOrderSchema.safeParse({
        tableId: TABLE,
        items: [line({ quantity: 100 })],
        clientRequestId: REQUEST,
      }).success
    ).toBe(false);
  });
});
