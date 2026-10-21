import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/public-menu-tag", () => ({ refreshPublicMenuTag: mocks.refresh }));
import { createProduct, updateProduct, deleteProduct, saveProductVariants, createModifierGroup, updateModifierGroup,
  deleteModifierGroup, createModifierOption, deleteModifierOption, linkProductModifierGroup, unlinkProductModifierGroup, updateModifierOption } from "./menu";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const groupId = "44444444-4444-4444-8444-444444444444";
const optionId = "55555555-5555-4555-8555-555555555555";
const otherId = "66666666-6666-4666-8666-666666666666";
const input = { name: "Café", price: 2, available: true, featured: false };
const variants = [{ name: "Pequeño", price: 2 }, { name: "Grande", price: 3 }];
const option = { id: optionId, name: "Leche", price: 0, position: 0 };
const group = { id: groupId, restaurant_id: restaurantId, name: "Elige leche", min_select: 0, max_select: 1, allow_repeat: false, modifier_options: [option] };
const groupInput = { name: "Elige leche", min_select: 0, max_select: 1, allow_repeat: false, options: [{ name: "Leche", price: 0 }] };
const product = (count = 1) => ({ id: productId, restaurant_id: restaurantId, price: 2, product_variants: Array.from({ length: count }, (_, i) => ({ id: i ? otherId : variantId, price: i + 2 })) });
type Reply = { data: unknown; error: null | { code: string; message: string }; count?: number };
const reply = (data: unknown, count?: number): Reply => ({ data, error: null, count });
const fail = (code = "23514"): Reply => ({ data: null, error: { code, message: "internal_constraint" } });
const owner = () => reply({ role: "OWNER" });
function client(replies: Reply[], user: { id: string } | null = { id: "owner" }, rpcReply: Reply = reply(productId)) {
  const queries: { table: string; calls: Record<string, ReturnType<typeof vi.fn>> }[] = [];
  const from = vi.fn((table: string) => {
    const response = replies.shift();
    if (!response) throw new Error(`Consulta inesperada: ${table}`);
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "insert", "upsert", "update", "delete", "in", "order"]) calls[method] = vi.fn(() => calls);
    calls.single = vi.fn(async () => response);
    calls.maybeSingle = vi.fn(async () => response);
    calls.then = vi.fn((resolve) => Promise.resolve(response).then(resolve));
    queries.push({ table, calls });
    return calls;
  });
  const rpc = vi.fn(async () => rpcReply);
  mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) }, from, rpc });
  return { from, rpc, queries, remaining: replies };
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("producto legacy y variantes", () => {
  it("mantiene el alta legacy y deja que el trigger cree el único precio", async () => {
    const db = client([owner(), reply({ id: productId })]);
    expect(await createProduct(restaurantId, input)).toEqual({ ok: true, data: productId });
    expect(db.queries[1].calls.insert).toHaveBeenCalledWith(expect.objectContaining({ price: 2 }));
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("crea con variantes mediante una sola RPC sin INSERT ni limpieza manual", async () => {
    const db = client([]);
    expect(await createProduct(restaurantId, { ...input, price: 99, variants, category_id: groupId, paired_drink_id: otherId, description: " Caliente " })).toEqual({ ok: true, data: productId });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("save_product_with_variants", {
      p_restaurant_id: restaurantId, p_name: "Café", p_variants: variants,
      p_product_id: null, p_category_id: groupId, p_description: "Caliente", p_paired_drink_id: otherId,
      p_available: true, p_featured: false,
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/menu");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("edita producto y variantes en la RPC conservando IDs y orden, sin escrituras REST", async () => {
    const db = client([reply(product(2)), owner()]);
    const rows = [{ id: variantId, name: "Grande", price: 3, position: 99 }, { name: "Pequeño", price: 2, position: 0 }];
    expect(await updateProduct(productId, { ...input, variants: rows })).toEqual({ ok: true, data: undefined });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("save_product_with_variants", {
      p_restaurant_id: restaurantId, p_product_id: productId, p_name: "Café",
      p_variants: [{ id: variantId, name: "Grande", price: 3 }, { name: "Pequeño", price: 2 }],
      p_category_id: null, p_description: null, p_paired_drink_id: null, p_available: true, p_featured: false,
    });
    expect(db.from).toHaveBeenCalledTimes(2);
    for (const query of db.queries) {
      expect(query.calls.update).not.toHaveBeenCalled();
      expect(query.calls.upsert).not.toHaveBeenCalled();
      expect(query.calls.delete).not.toHaveBeenCalled();
    }
  });
  it.each(["42501", "22023", "23514"])("traduce %s de la RPC y no limpia ni refresca tras el fallo", async (code) => {
    const db = client([], null, fail(code));
    const result = await createProduct(restaurantId, { ...input, variants });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/permiso|catálogo/) });
    expect(JSON.stringify(result)).not.toContain("internal_constraint");
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("un fallo de edición con variantes no desencadena un UPDATE de respaldo", async () => {
    const db = client([reply(product(2)), owner()], { id: "owner" }, fail("22023"));
    expect((await updateProduct(productId, { ...input, variants })).ok).toBe(false);
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("no reporta éxito ni invalida caché si la RPC no devuelve ID", async () => {
    const db = client([], { id: "owner" }, reply(null));
    expect((await createProduct(restaurantId, { ...input, variants })).ok).toBe(false);
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("mantiene la validación local antes de llamar a la RPC", async () => {
    expect((await createProduct(restaurantId, { ...input, variants: [] })).ok).toBe(false);
    expect((await updateProduct(productId, { ...input, variants: [{ name: "", price: 5 }] })).ok).toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("actualiza el precio legacy cuando existe una sola variante", async () => {
    const db = client([reply(product()), owner(), reply([{ id: productId }])]);
    expect((await updateProduct(productId, { ...input, price: 4 })).ok).toBe(true);
    expect(db.queries[2].calls.update).toHaveBeenCalledWith(expect.objectContaining({ price: 4 }));
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("omite price al editar un producto con múltiples variantes", async () => {
    const db = client([reply(product(2)), owner(), reply([{ id: productId }])]);
    expect((await updateProduct(productId, { ...input, price: 99 })).ok).toBe(true);
    expect(db.queries[2].calls.update.mock.calls[0][0]).not.toHaveProperty("price");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("detecta cero filas en la edición y conserva el contrato del borrado legacy", async () => {
    client([reply(product()), owner(), reply([])]);
    expect((await updateProduct(productId, input)).ok).toBe(false);
    client([reply([{ id: productId }])]);
    expect(await deleteProduct(productId)).toEqual({ ok: true, data: undefined });
    client([reply([])]);
    expect((await deleteProduct(productId)).ok).toBe(false);
  });
  it("rechaza variantes vacías antes de crear el cliente o llamar a la RPC", async () => {
    expect((await saveProductVariants(productId, [])).ok).toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("valida el ID del producto antes de abrir el cliente", async () => {
    expect(await saveProductVariants("inválido", [{ name: "", price: 2 }])).toEqual({ ok: false, error: "Producto inválido." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([null, undefined])("guarda solo variantes con una RPC void (%s), sin leer ni escribir campos del producto", async (data) => {
    const db = client([], { id: "owner" }, reply(data));
    const rows = [{ id: variantId, name: " Grande ", price: 3, position: 99 }, { name: "Pequeño", price: 2, position: 0 }];
    expect(await saveProductVariants(productId, rows)).toEqual({ ok: true, data: undefined });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("save_product_variants", {
      p_product_id: productId,
      p_variants: [{ id: variantId, name: "Grande", price: 3 }, { name: "Pequeño", price: 2 }],
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/menu");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it.each(["42501", "22023", "23514"])("traduce %s al guardar solo variantes sin fallback REST ni refresco de caché", async (code) => {
    const db = client([], null, fail(code));
    const result = await saveProductVariants(productId, [{ id: otherId, name: "", price: 2 }]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/permiso|catálogo/) });
    expect(JSON.stringify(result)).not.toContain("internal_constraint");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("save_product_variants", {
      p_product_id: productId, p_variants: [{ id: otherId, name: "", price: 2 }],
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("permisos y aislamiento", () => {
  it("rechaza usuario anónimo, rol operativo y miembro inactivo", async () => {
    for (const role of [null, { role: "WAITER" }, { role: "KITCHEN" }]) {
      const db = client([reply(role)]);
      expect((await createModifierGroup(restaurantId, groupInput)).ok).toBe(false);
      expect(db.from).toHaveBeenCalledTimes(1);
      expect(db.queries[0].calls.eq).toHaveBeenCalledWith("status", "ACTIVE");
    }
    const db = client([], null);
    expect((await createProduct(restaurantId, input)).ok).toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("permite ADMIN y verifica que la categoría pertenezca al restaurante", async () => {
    const db = client([reply({ role: "ADMIN" }), reply(null)]);
    expect((await createProduct(restaurantId, { ...input, category_id: otherId })).ok).toBe(false);
    expect(db.queries[1].calls.eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(db.from).toHaveBeenCalledTimes(2);
  });
  it("rechaza vínculos entre restaurantes aunque pueda leer ambos", async () => {
    const db = client([reply(product()), owner(), reply({ restaurant_id: otherId })]);
    expect((await linkProductModifierGroup({ product_id: productId, group_id: groupId })).ok).toBe(false);
    expect(db.from).toHaveBeenCalledTimes(3);
  });
});

describe("personalizaciones y opciones", () => {
  it("crea grupo con opciones y revierte el alta cuando las opciones fallan", async () => {
    let db = client([owner(), reply({ id: groupId }), reply([]), reply([{ id: optionId }])]);
    expect(await createModifierGroup(restaurantId, groupInput)).toEqual({ ok: true, data: groupId });
    expect(db.queries[1].calls.insert.mock.calls[0][0]).not.toHaveProperty("legacy_option_id");
    db = client([owner(), reply({ id: groupId }), reply([]), fail(), reply([{ id: groupId }])]);
    expect((await createModifierGroup(restaurantId, groupInput)).ok).toBe(false);
    expect(db.queries[4].calls.delete).toHaveBeenCalled();
  });
  it("valida min/max en servidor antes de crear", async () => {
    expect((await createModifierGroup(restaurantId, { ...groupInput, max_select: 2 })).ok).toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("actualiza reglas después del upsert y antes de quitar opciones", async () => {
    const db = client([reply(group), owner(), reply([{ id: optionId }, { id: otherId }]), reply([{ id: optionId }]), reply([{ id: groupId }]), reply([{ id: otherId }])]);
    expect((await updateModifierGroup(groupId, { ...groupInput, options: [option] })).ok).toBe(true);
    expect(db.queries.map((query) => query.table)).toEqual(["modifier_groups", "restaurant_members", "modifier_options", "modifier_options", "modifier_groups", "modifier_options"]);
    expect(db.queries[4].calls.update).toHaveBeenCalled();
    expect(db.queries[5].calls.delete).toHaveBeenCalled();
  });
  it("exige confirmar el número actual de productos antes de borrar un grupo usado", async () => {
    let db = client([reply(group), owner(), reply(null, 3)]);
    expect(await deleteModifierGroup(groupId, 2)).toMatchObject({ ok: false, error: expect.stringContaining("3 productos") });
    expect(db.from).toHaveBeenCalledTimes(3);
    db = client([reply(group), owner(), reply(null, 3), reply([{ id: groupId }])]);
    expect((await deleteModifierGroup(groupId, 3)).ok).toBe(true);
    expect(db.queries[3].calls.delete).toHaveBeenCalled();
  });
  it("no permite borrar una opción si máximo excedería las restantes", async () => {
    const db = client([reply(group), owner()]);
    expect((await deleteModifierOption(groupId, optionId)).ok).toBe(false);
    expect(db.from).toHaveBeenCalledTimes(2);
  });
  it("crea y actualiza opciones sin aceptar cambios de padre", async () => {
    let db = client([reply(group), owner(), reply({ id: otherId })]);
    expect((await createModifierOption(groupId, { name: "Soya", price: 0.5, group_id: otherId })).ok).toBe(true);
    expect(db.queries[2].calls.insert).toHaveBeenCalledWith(expect.objectContaining({ group_id: groupId }));
    db = client([reply(group), owner(), reply([{ id: optionId }])]);
    expect((await updateModifierOption(groupId, optionId, { ...option, price: 1, group_id: otherId })).ok).toBe(true);
    expect(db.queries[2].calls.update.mock.calls[0][0]).not.toHaveProperty("group_id");
    expect(db.queries[2].calls.eq).toHaveBeenCalledWith("group_id", groupId);
  });
  it("no vincula un grupo legacy con límites imposibles de cumplir", async () => {
    const db = client([reply(product()), owner(), reply({ ...group, modifier_options: [] })]);
    expect((await linkProductModifierGroup({ product_id: productId, group_id: groupId })).ok).toBe(false);
    expect(db.from).toHaveBeenCalledTimes(3);
  });
  it("un vínculo se crea/reordena por producto-grupo y se elimina acotado a ambos", async () => {
    let db = client([reply(product()), owner(), reply(group), reply({ id: otherId })]);
    expect((await linkProductModifierGroup({ product_id: productId, group_id: groupId, position: 1 })).ok).toBe(true);
    expect(db.queries[3].calls.upsert).toHaveBeenCalledWith({ product_id: productId, group_id: groupId, position: 1 }, { onConflict: "product_id,group_id" });
    db = client([reply(product()), owner(), reply([{ id: otherId }])]);
    expect((await unlinkProductModifierGroup(productId, groupId)).ok).toBe(true);
    expect(db.queries[2].calls.eq).toHaveBeenCalledWith("product_id", productId);
    expect(db.queries[2].calls.eq).toHaveBeenCalledWith("group_id", groupId);
  });
});
