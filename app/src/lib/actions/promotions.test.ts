import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
  getMyRestaurant: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/public-menu-tag", () => ({ refreshPublicMenuTag: mocks.refresh }));
vi.mock("@/lib/queries/staff", () => ({ getMyRestaurant: mocks.getMyRestaurant }));

import { deletePromotion, getActivePromotions, savePromotion } from "./promotions";

const RID = "11111111-1111-4111-8111-111111111111";
const PID = "22222222-2222-4222-8222-222222222222";
const PROD = "33333333-3333-4333-8333-333333333333";
const ALL = {
  pos: { tables: true, dine_in_no_table: true, takeaway: true, delivery: true },
  digital_menu: { tables: true, pickup: true, delivery: false },
};
const form = {
  name: "QA 2x1",
  type: "buy_x_get_y",
  value_type: null,
  value: null,
  receive_qty: 2,
  buy_qty: 1,
  applies_to: "products",
  target_ids: [PROD],
  activation: "weekdays",
  weekdays: [5],
  starts_on: null,
  ends_on: null,
  service_options: ALL,
  status: "active",
};

function client(rpcReply: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcReply);
  mocks.createClient.mockResolvedValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("savePromotion", () => {
  it("sends the whole form as p_data and refreshes the menu", async () => {
    const rpc = client({ data: { id: PID, name: "QA 2x1" }, error: null });
    const r = await savePromotion(RID, form, PID);
    expect(r).toEqual({ ok: true, data: { id: PID, name: "QA 2x1" } });
    expect(rpc).toHaveBeenCalledWith("save_promotion", {
      p_restaurant_id: RID,
      p_promotion_id: PID,
      p_data: {
        name: "QA 2x1", type: "buy_x_get_y", applies_to: "products", target_ids: [PROD], service_options: ALL,
        status: "active", receive_qty: 2, buy_qty: 1, weekdays: [5],
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/menu");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("create omits the id", async () => {
    const rpc = client({ data: { id: PID }, error: null });
    await savePromotion(RID, form);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_promotion_id");
  });

  it("rejects an empty day picker before calling the database", async () => {
    const rpc = client({ data: null, error: null });
    const r = await savePromotion(RID, { ...form, weekdays: [] });
    expect(r).toEqual({ ok: false, error: "Elige al menos un día", field: "weekdays" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC field hint and hides internal errors", async () => {
    client({ data: null, error: { code: "P0001", message: "La fecha de fin ya pasó", hint: "field=ends_on" } });
    expect(await savePromotion(RID, form)).toEqual({ ok: false, error: "La fecha de fin ya pasó", field: "ends_on" });
    client({ data: null, error: { code: "42501", message: "No autorizado para gestionar promociones" } });
    expect(await savePromotion(RID, form)).toEqual({ ok: false, error: "No tienes permiso para gestionar promociones." });
    client({ data: null, error: { code: "23514", message: "promotions_bxgy_shape" } });
    const r = await savePromotion(RID, form);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).not.toContain("promotions_");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deletePromotion", () => {
  it("calls delete_promotion and validates the id", async () => {
    const rpc = client({ data: null, error: null });
    expect(await deletePromotion(PID)).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith("delete_promotion", { p_promotion_id: PID });
    expect(await deletePromotion("nope")).toEqual({ ok: false, error: "Promoción inválida" });
  });
});

describe("getActivePromotions", () => {
  it("uses the session restaurant and the channel", async () => {
    mocks.getMyRestaurant.mockResolvedValue({ restaurant: { id: RID } });
    const rpc = client({ data: [{ id: PID, label: "2x1" }], error: null });
    expect(await getActivePromotions("pos.tables")).toEqual({ ok: true, data: [{ id: PID, label: "2x1" }] });
    expect(rpc).toHaveBeenCalledWith("get_active_promotions", { p_restaurant_id: RID, p_channel: "pos.tables" });
  });
  it("without a channel returns every active promotion", async () => {
    mocks.getMyRestaurant.mockResolvedValue({ restaurant: { id: RID } });
    const rpc = client({ data: [], error: null });
    expect(await getActivePromotions(null)).toEqual({ ok: true, data: [] });
    expect(rpc).toHaveBeenCalledWith("get_active_promotions", { p_restaurant_id: RID });
  });
  it("rejects unknown channels", async () => {
    expect(await getActivePromotions("pos.moon" as never)).toEqual({ ok: false, error: "Canal inválido" });
  });
});
