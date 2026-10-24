import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createPublicClient: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: mocks.createPublicClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { acceptOnlineOrder, placeOnlineOrder, rejectOnlineOrder, reviewOnlineOrder, saveDeliverySettings } from "./digital-menu";

const P1 = "11111111-1111-4111-8111-111111111111";
const REQ = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";
const RID = "44444444-4444-4444-8444-444444444444";

type Reply = { data: unknown; error: null | { code: string; message: string; hint?: string } };
function rpcClient(...replies: Reply[]) {
  const rpc = vi.fn(async () => replies.shift() ?? { data: null, error: null });
  return { rpc };
}

const base = {
  slug: "monky-qa",
  serviceType: "delivery" as const,
  items: [{ product_id: P1, quantity: 2 }],
  clientRequestId: REQ,
  customerName: " QA Ana ",
  customerPhone: "099 123 4567",
  paymentMethod: "cash" as const,
  address: { calle: "Av. 1", numero: "2", colonia: "Centro", entre_calles: "" },
  paysWithAmount: 20,
};

beforeEach(() => vi.clearAllMocks());

describe("placeOnlineOrder", () => {
  it("sends the trimmed payload to place_online_order with the anon client", async () => {
    const client = rpcClient({ data: { order_id: ORDER, tracking_token: REQ }, error: null });
    mocks.createPublicClient.mockReturnValue(client);
    const result = await placeOnlineOrder(base);
    expect(result).toEqual({ ok: true, data: { order_id: ORDER, tracking_token: REQ } });
    expect(client.rpc).toHaveBeenCalledWith("place_online_order", {
      p_slug: "monky-qa",
      p_service_type: "delivery",
      p_items: [{ product_id: P1, quantity: 2 }],
      p_client_request_id: REQ,
      p_customer_name: "QA Ana",
      p_customer_phone: "099 123 4567",
      p_payment_method: "cash",
      p_delivery_address: { calle: "Av. 1", numero: "2", colonia: "Centro" },
      p_pays_with_amount: 20,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("pickup never sends an address", async () => {
    const client = rpcClient({ data: {}, error: null });
    mocks.createPublicClient.mockReturnValue(client);
    await placeOnlineOrder({ ...base, serviceType: "pickup" });
    expect(client.rpc.mock.calls[0]).toBeDefined();
    expect((client.rpc.mock.calls[0] as unknown[])[1]).not.toHaveProperty("p_delivery_address");
  });

  it("maps rate-limit and field hints to code/field with the database message", async () => {
    mocks.createPublicClient.mockReturnValue(
      rpcClient({ data: null, error: { code: "P0001", message: "Ya hiciste varios pedidos hace poco.", hint: "rate_limit=phone" } })
    );
    expect(await placeOnlineOrder(base)).toEqual({
      ok: false,
      error: "Ya hiciste varios pedidos hace poco.",
      code: "rate_limit:phone",
    });
    mocks.createPublicClient.mockReturnValue(
      rpcClient({ data: null, error: { code: "P0001", message: "La compra mínima es de $10.00", hint: "field=min_purchase" } })
    );
    expect(await placeOnlineOrder(base)).toEqual({ ok: false, error: "La compra mínima es de $10.00", field: "min_purchase" });
  });

  it("validates before calling the database", async () => {
    const result = await placeOnlineOrder({ ...base, address: undefined });
    expect(result).toEqual({ ok: false, error: "Escribe la dirección de entrega.", field: "address" });
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });
});

describe("staff actions", () => {
  it("review marks the order and returns the contact from get_order_contact", async () => {
    const client = rpcClient(
      { data: { status_review: "reviewed" }, error: null },
      { data: { customer_phone: "0991234567", delivery_address: { calle: "A", numero: "1", colonia: "B" } }, error: null }
    );
    mocks.createClient.mockResolvedValue(client);
    expect(await reviewOnlineOrder(ORDER)).toEqual({
      ok: true,
      data: { customerPhone: "0991234567", deliveryAddress: { calle: "A", numero: "1", colonia: "B" } },
    });
    expect(client.rpc.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["review_online_order", "get_order_contact"]);
  });

  it("accept passes shipping only when given; reject passes the reason", async () => {
    const client = rpcClient({ data: {}, error: null }, { data: {}, error: null }, { data: {}, error: null });
    mocks.createClient.mockResolvedValue(client);
    await acceptOnlineOrder({ orderId: ORDER, shippingCost: 1.5 });
    await acceptOnlineOrder({ orderId: ORDER });
    await rejectOnlineOrder({ orderId: ORDER, reason: " Sin stock " });
    expect(client.rpc.mock.calls).toEqual([
      ["accept_online_order", { p_order_id: ORDER, p_shipping_cost: 1.5 }],
      ["accept_online_order", { p_order_id: ORDER }],
      ["reject_online_order", { p_order_id: ORDER, p_reason: "Sin stock" }],
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
  });

  it("delivery settings drop amounts of disabled thresholds", async () => {
    const client = rpcClient({ data: { slug: "monky-qa" }, error: null });
    mocks.createClient.mockResolvedValue(client);
    await saveDeliverySettings(RID, {
      free_shipping_enabled: false,
      free_shipping_min_amount: 15,
      min_purchase_enabled: true,
      min_purchase_amount: 8,
      delivery_time_min: 20,
      delivery_time_max: 40,
      pickup_time: 10,
      unconfirmed_ttl_minutes: 30,
    });
    expect(client.rpc).toHaveBeenCalledWith("save_delivery_settings", {
      p_restaurant_id: RID,
      p_data: expect.objectContaining({ free_shipping_min_amount: null, min_purchase_amount: 8, delivery_time_max: 40 }),
    });
  });
});
