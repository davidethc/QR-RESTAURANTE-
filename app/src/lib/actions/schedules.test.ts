import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/public-menu-tag", () => ({ refreshPublicMenuTag: mocks.refresh }));

import { createSchedule, updateSchedule, saveScheduleShift, deleteScheduleShift } from "./schedules";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const shiftId = "33333333-3333-4333-8333-333333333333";
const input = { weekday: 1, starts_at: "09:00", ends_at: "17:00" };
const savedShift = { id: shiftId, schedule_id: scheduleId, ...input };

type Reply = { data: unknown; error: null | { code: string; message: string } };
function client(replies: Reply[], user: { id: string } | null = { id: "owner" }) {
  const queries: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const from = vi.fn(() => {
    const response = replies.shift();
    if (!response) throw new Error("Consulta inesperada");
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "insert", "update", "delete", "order"]) query[method] = vi.fn(() => query);
    query.single = vi.fn(async () => response);
    query.maybeSingle = vi.fn(async () => response);
    query.then = vi.fn((resolve) => Promise.resolve(response).then(resolve));
    queries.push(query);
    return query;
  });
  mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) }, from });
  return { from, queries };
}
const reply = (data: unknown): Reply => ({ data, error: null });
const owner = () => reply({ role: "OWNER" });
const schedule = () => reply({ id: scheduleId });

beforeEach(() => vi.clearAllMocks());

describe("acciones de horarios", () => {
  it("rechaza una sesión ausente sin consultar tablas", async () => {
    const db = client([], null);
    expect((await createSchedule(restaurantId, { name: "Desayunos" })).ok).toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rechaza roles operativos y exige membresía activa del restaurante", async () => {
    const db = client([reply({ role: "WAITER" })]);
    expect((await createSchedule(restaurantId, { name: "Desayunos" })).ok).toBe(false);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.queries[0].eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
    expect(db.queries[0].eq).toHaveBeenCalledWith("status", "ACTIVE");
  });
  it("permite ADMIN y crea un horario sin turnos", async () => {
    const db = client([reply({ role: "ADMIN" }), reply({ id: scheduleId, restaurant_id: restaurantId, name: "Desayunos" })]);
    expect(await createSchedule(restaurantId, { name: " Desayunos " })).toMatchObject({ ok: true, data: { schedule_shifts: [], name: "Desayunos" } });
    expect(db.queries[1].insert).toHaveBeenCalledWith({ restaurant_id: restaurantId, name: "Desayunos" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/menu");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("traduce nombres duplicados al español", async () => {
    client([owner(), { data: null, error: { code: "23505", message: "internal constraint" } }]);
    expect(await createSchedule(restaurantId, { name: "Desayunos" })).toEqual({ ok: false, error: "Ya existe un horario con ese nombre." });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("rechaza un horario ajeno antes de leer o escribir turnos", async () => {
    const db = client([owner(), reply(null)]);
    expect((await saveScheduleShift(restaurantId, scheduleId, input)).ok).toBe(false);
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.queries[1].eq).toHaveBeenCalledWith("restaurant_id", restaurantId);
  });
  it("valida los solapamientos contra los turnos persistidos", async () => {
    const db = client([owner(), schedule(), reply([savedShift])]);
    expect(await saveScheduleShift(restaurantId, scheduleId, input)).toMatchObject({ ok: false, error: "Este turno se superpone con otro, incluido el que termina al día siguiente." });
    expect(db.from).toHaveBeenCalledTimes(3);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("rechaza la cola nocturna de domingo sobre lunes antes de escribir", async () => {
    const db = client([owner(), schedule(), reply([{ ...savedShift, weekday: 0, starts_at: "22:00", ends_at: "10:00" }])]);
    expect(await saveScheduleShift(restaurantId, scheduleId, input)).toMatchObject({
      ok: false, error: "Este turno se superpone con otro, incluido el que termina al día siguiente.",
    });
    expect(db.from).toHaveBeenCalledTimes(3);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("edita sin comparar el turno contra sí mismo y acota el UPDATE al horario", async () => {
    const db = client([owner(), schedule(), reply([savedShift]), reply(savedShift)]);
    expect(await saveScheduleShift(restaurantId, scheduleId, input, shiftId)).toEqual({ ok: true, data: savedShift });
    expect(db.queries[3].eq).toHaveBeenCalledWith("id", shiftId);
    expect(db.queries[3].eq).toHaveBeenCalledWith("schedule_id", scheduleId);
  });
  it("no informa éxito si RLS devuelve cero filas al actualizar", async () => {
    client([owner(), schedule(), reply([])]);
    expect((await updateSchedule(restaurantId, scheduleId, { name: "Nuevo" })).ok).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("no informa éxito al borrar un turno inexistente", async () => {
    const db = client([owner(), schedule(), reply([])]);
    expect((await deleteScheduleShift(restaurantId, scheduleId, shiftId)).ok).toBe(false);
    expect(db.queries[2].eq).toHaveBeenCalledWith("schedule_id", scheduleId);
  });
  it("rechaza identificadores inválidos antes de consultar Supabase", async () => {
    expect((await saveScheduleShift(restaurantId, scheduleId, input, "inválido")).ok).toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
