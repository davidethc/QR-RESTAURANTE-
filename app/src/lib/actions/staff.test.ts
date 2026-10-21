import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), adminRpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn(),
  createUser: vi.fn(), deleteUser: vi.fn(), updateUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/queries/staff", () => ({ getStaffOrders: vi.fn(), getWaiterCalls: vi.fn() }));
import { saveMember } from "./staff";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const registerId = "44444444-4444-4444-8444-444444444444";
const input = { memberId, fullName: "Ana Pérez", roles: ["WAITER"], active: true, emailLoginEnabled: true, email: "ana@correo.com" };
const target = { id: memberId, restaurant_id: restaurantId, user_id: userId, role: "WAITER", roles: ["WAITER"], status: "ACTIVE", updated_at: "version-1" };
type Reply = { data: unknown; error: null | { code?: string; message: string } };
const reply = (data: unknown): Reply => ({ data, error: null });
const failure = (code = "23514", message = "SQL con hash-secreto"): Reply => ({ data: null, error: { code, message } });

function queries(responses: Reply[]) {
  const requests: { table: string; calls: Record<string, ReturnType<typeof vi.fn>> }[] = [];
  const from = vi.fn((table: string) => {
    const response = responses.shift();
    if (!response) throw new Error(`Consulta inesperada: ${table}`);
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "in", "not", "update"]) calls[method] = vi.fn(() => calls);
    calls.maybeSingle = vi.fn(async () => response);
    calls.single = vi.fn(async () => response);
    calls.then = vi.fn((resolve) => Promise.resolve(response).then(resolve));
    requests.push({ table, calls });
    return calls;
  });
  return { from, requests, remaining: responses };
}

function setup({ actor = { role: "OWNER", status: "ACTIVE" } as unknown, targetRow = target as unknown,
  clientReplies = [] as Reply[], adminReplies = [] as Reply[], rpcReplies = [reply(true), reply(userId)], newPin = false, pinPresent = true, user = { id: "actor" } as { id: string } | null } = {}) {
  const db = queries([reply(actor), ...clientReplies]);
  const privileged = queries([reply(targetRow), ...(newPin ? [] : [reply(pinPresent ? { id: memberId } : null)]), reply({ id: memberId }), reply({ id: userId }), ...adminReplies]);
  const rpc = vi.fn(async () => { const next = rpcReplies.shift(); if (!next) throw new Error("RPC inesperada"); return next; });
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) }, from: db.from, rpc });
  mocks.admin.mockReturnValue({ from: privileged.from, rpc: mocks.adminRpc, auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser, updateUserById: mocks.updateUser, getUserById: mocks.getUser } } });
  return { db, privileged, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId, email: "ana@correo.com" } }, error: null });
  mocks.createUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("saveMember: permisos y alcance", () => {
  it("rechaza entrada inválida antes de crear clientes", async () => {
    expect((await saveMember(restaurantId, { ...input, roles: ["CASHIER"] })).ok).toBe(false);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("exige sesión y membresía activa OWNER/ADMIN", async () => {
    for (const actor of [null, { role: "WAITER", status: "ACTIVE" }, { role: "ADMIN", status: "INACTIVE" }]) {
      setup({ actor });
      expect((await saveMember(restaurantId, input)).ok).toBe(false);
    }
    const { db } = setup({ user: null });
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("ADMIN no asigna ADMIN y no abre el cliente privilegiado si la RPC lo niega", async () => {
    const { rpc } = setup({ actor: { role: "ADMIN", status: "ACTIVE" }, rpcReplies: [reply(false)] });
    expect((await saveMember(restaurantId, { ...input, roles: ["ADMIN", "WAITER"] })).ok).toBe(false);
    expect(rpc).toHaveBeenCalledWith("can_manage_staff_role", { p_restaurant_id: restaurantId, p_role: "ADMIN" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("no permite cambiar al propio usuario ni gestiona un target denegado por RPC", async () => {
    setup({ rpcReplies: [reply(true), reply("actor")] });
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    setup({ rpcReplies: [reply(true), failure("P0001", "No tienes permiso")] });
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("filtra el miembro por sucursal y por el user_id autorizado en la RPC", async () => {
    const { privileged } = setup({ targetRow: null });
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    expect(privileged.requests[0].calls.eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(privileged.requests[0].calls.eq).toHaveBeenCalledWith("user_id", userId);
    expect(privileged.from).toHaveBeenCalledTimes(1);
  });
  it("solo el dueño gestiona un target con ADMIN entre los roles múltiples", async () => {
    const { privileged } = setup({ actor: { role: "ADMIN", status: "ACTIVE" }, targetRow: { ...target, roles: ["ADMIN", "WAITER"] } });
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    expect(privileged.from).toHaveBeenCalledTimes(1);
  });
});

describe("saveMember: reglas de edición", () => {
  it("guarda Mesero sin cajas ni PIN nuevo, conservando su hash", async () => {
    const { privileged } = setup({ actor: { role: "ADMIN", status: "ACTIVE" } });
    expect(await saveMember(restaurantId, input)).toEqual({ ok: true, data: memberId });
    expect(privileged.requests[2].calls.update).toHaveBeenCalledWith(expect.objectContaining({ roles: ["WAITER"], cash_register_ids: [], email_login_enabled: true }));
    const payload = privileged.requests[2].calls.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty("pin_hash");
    expect(payload).not.toHaveProperty("pin");
    expect(privileged.requests[1].calls.select).toHaveBeenCalledWith("id");
    expect(privileged.requests[1].calls.not).toHaveBeenCalledWith("pin_hash", "is", null);
    expect(privileged.requests[0].calls.select).toHaveBeenCalledWith("id, restaurant_id, user_id, role, roles, status, updated_at");
    expect(mocks.updateUser.mock.calls[0][1]).not.toHaveProperty("password");
    expect(mocks.updateUser.mock.calls[0][1]).not.toHaveProperty("email");
    expect(mocks.revalidate).toHaveBeenCalledWith("/staff");
  });
  it("comprueba cajas de la misma sucursal y guarda la combinación exacta", async () => {
    const { db, privileged } = setup({ clientReplies: [reply([{ id: registerId }])] });
    expect((await saveMember(restaurantId, { ...input, roles: ["WAITER", "CASHIER"], cashRegisterIds: [registerId] })).ok).toBe(true);
    expect(db.requests[1].calls.eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(db.requests[1].calls.eq).toHaveBeenCalledWith("active", true);
    expect(privileged.requests[2].calls.update).toHaveBeenCalledWith(expect.objectContaining({ roles: ["WAITER", "CASHIER"], cash_register_ids: [registerId] }));
  });
  it("rechaza cajas ajenas/inactivas antes de acceder a datos privilegiados", async () => {
    setup({ clientReplies: [reply([])] });
    expect((await saveMember(restaurantId, { ...input, roles: ["CASHIER"], cashRegisterIds: [registerId] })).ok).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("no confía en hasPin del cliente cuando el hash guardado está ausente", async () => {
    const { privileged } = setup({ pinPresent: false });
    expect((await saveMember(restaurantId, { ...input, hasPin: true })).ok).toBe(false);
    expect(privileged.from).toHaveBeenCalledTimes(2);
  });
  it("establece el PIN con la RPC de sesión después de guardar, sin hash en el update", async () => {
    const { privileged, rpc } = setup({ newPin: true, rpcReplies: [reply(true), reply(userId), reply(null)] });
    const result = await saveMember(restaurantId, { ...input, pin: "0123" });
    expect(result).toEqual({ ok: true, data: memberId });
    expect(rpc).toHaveBeenCalledWith("set_member_pin", { p_member_id: memberId, p_pin: "0123" });
    expect(privileged.requests[1].calls.update.mock.calls[0][0]).not.toHaveProperty("pin_hash");
    expect(privileged.requests[1].calls.update.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[2]);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("hash");
    expect(JSON.stringify(privileged.requests[1].calls.update.mock.calls)).not.toContain("0123");
  });
  it("rechaza desalineación que haría que el trigger perdiera los roles múltiples", async () => {
    const { privileged } = setup({ targetRow: { ...target, role: "KITCHEN", roles: ["WAITER"] } });
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    expect(privileged.from).toHaveBeenCalledTimes(2);
  });
  it("detecta conflictos de edición con updated_at y no informa éxito por cero filas", async () => {
    const { privileged } = setup();
    privileged.remaining[2] = reply(null);
    expect((await saveMember(restaurantId, input)).ok).toBe(false);
    expect(privileged.requests[2].calls.eq).toHaveBeenCalledWith("updated_at", target.updated_at);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("no expone ni registra mensajes SQL que pudieran contener el hash", async () => {
    const { privileged } = setup({ newPin: true });
    privileged.remaining[1] = failure();
    const result = await saveMember(restaurantId, { ...input, pin: "0123" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("hash-secreto");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("hash-secreto");
  });
});

describe("saveMember: altas y límites de expand", () => {
  const create = { ...input, memberId: undefined, emailLoginEnabled: true, email: "ana@correo.com", password: "clave1234", pin: "0123" };
  it("crea cuenta, vincula la sucursal elegida y completa roles/PIN en restaurant_members", async () => {
    const { privileged, rpc } = setup({ rpcReplies: [reply(true), reply(memberId), reply(null)] });
    // En alta no se lee un miembro previo ni se cambia profiles: la RPC lo hace.
    privileged.remaining.splice(0, privileged.remaining.length, reply({ id: memberId }));
    expect(await saveMember(restaurantId, create)).toEqual({ ok: true, data: memberId });
    expect(rpc).toHaveBeenCalledWith("add_staff_member", expect.objectContaining({ p_restaurant_id: restaurantId, p_user_id: userId }));
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }));
    expect(privileged.requests[0].table).toBe("restaurant_members");
    expect(privileged.requests[0].calls.eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(privileged.requests[0].calls.update).toHaveBeenCalledWith(expect.objectContaining({ roles: ["WAITER"] }));
    expect(privileged.requests[0].calls.update.mock.calls[0][0]).not.toHaveProperty("pin_hash");
    expect(rpc).toHaveBeenCalledWith("set_member_pin", { p_member_id: memberId, p_pin: "0123" });
  });
  it("limpia el usuario recién creado si falla guardar los campos nuevos", async () => {
    const { privileged } = setup({ rpcReplies: [reply(true), reply(memberId), reply(null)] });
    privileged.remaining.splice(0, privileged.remaining.length, failure());
    expect((await saveMember(restaurantId, create)).ok).toBe(false);
    expect(mocks.deleteUser).toHaveBeenCalledWith(userId);
  });
  it("traduce correo repetido sin revelar detalles de Auth", async () => {
    setup({ rpcReplies: [reply(true)] });
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists", message: "internal" } });
    expect(await saveMember(restaurantId, create)).toMatchObject({ ok: false, error: expect.stringContaining("Ese correo ya tiene una cuenta") });
  });
  it("no inventa cuentas sin correo ni puentes de roles no definidos", async () => {
    setup({ rpcReplies: [reply(true)] });
    expect((await saveMember(restaurantId, { ...create, emailLoginEnabled: false })).ok).toBe(false);
    setup({ rpcReplies: [reply(true)], clientReplies: [reply([{ id: registerId }])] });
    expect((await saveMember(restaurantId, { ...create, roles: ["CASHIER"], cashRegisterIds: [registerId] })).ok).toBe(false);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});


describe("saveMember: correcciones de seguridad", () => {
  it("rechaza desactivar el correo tanto al crear como al editar antes de escribir", async () => {
    for (const member of [memberId, undefined]) {
      const result = await saveMember(restaurantId, { ...input, memberId: member, emailLoginEnabled: false, pin: "1234" });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("El acceso por correo no se puede desactivar hasta M00-T03") });
    }
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(["01234", "012345"])("rechaza el PIN %s sin abrir clientes ni llamar a la RPC", async (pin) => {
    expect(await saveMember(restaurantId, { ...input, pin })).toEqual({ ok: false, error: "El PIN debe tener 4 dígitos" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("solo envía email a Auth si difiere del correo actual", async () => {
    setup();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, email: " ANA@CORREO.COM " } }, error: null });
    expect((await saveMember(restaurantId, input)).ok).toBe(true);
    expect(mocks.updateUser.mock.calls[0][1]).not.toHaveProperty("email");
  });
  it("actualiza un correo cambiado después de consultar Auth", async () => {
    setup();
    expect((await saveMember(restaurantId, { ...input, email: "otro@correo.com" })).ok).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledWith(userId);
    expect(mocks.updateUser).toHaveBeenCalledWith(userId, expect.objectContaining({ email: "otro@correo.com" }));
  });
  it.each(["42501", "22023", "P0001"])("sanitiza %s de set_member_pin sin registrar ni devolver el PIN", async (code) => {
    setup({ newPin: true, rpcReplies: [reply(true), reply(userId), failure(code, "PIN enviado: 0987")] });
    const result = await saveMember(restaurantId, { ...input, pin: "0987" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permiso|dígitos|asignar/);
    expect(JSON.stringify(result)).not.toContain("0987");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("0987");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/staff");
  });
  it("oculta también excepciones inesperadas de transporte que incluyan el PIN", async () => {
    const { rpc } = setup({ newPin: true });
    rpc.mockResolvedValueOnce(reply(true)).mockResolvedValueOnce(reply(userId)).mockRejectedValueOnce(new Error("PIN recibido: 0987"));
    const result = await saveMember(restaurantId, { ...input, pin: "0987" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("No se pudo guardar el PIN") });
    expect(JSON.stringify(result)).not.toContain("0987");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("0987");
  });
  it("retira el alta nueva si set_member_pin falla", async () => {
    const { privileged } = setup({ rpcReplies: [reply(true), reply(memberId), failure("22023", "PIN: 0123")] });
    privileged.remaining.splice(0, privileged.remaining.length, reply({ id: memberId }));
    const result = await saveMember(restaurantId, { ...input, memberId: undefined, password: "clave1234", pin: "0123" });
    expect(result.ok).toBe(false);
    expect(mocks.deleteUser).toHaveBeenCalledWith(userId);
    expect(JSON.stringify(result)).not.toContain("0123");
  });
});
