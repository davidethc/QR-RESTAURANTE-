"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure } from "@/lib/db-errors";
import { refreshPublicMenuTag } from "@/lib/public-menu-tag";
import { scheduleSchema, scheduleShiftSchema, scheduleShiftsSchema } from "@/lib/validations/schedules";
import type { ActionResult } from "@/types/actions";
import type { Database } from "@/types/database";

type Schedule = Database["public"]["Tables"]["schedules"]["Row"];
export type ScheduleShift = Database["public"]["Tables"]["schedule_shifts"]["Row"];
export type ScheduleWithShifts = Schedule & { schedule_shifts: ScheduleShift[] };
const uuid = z.string().uuid("Identificador inválido");
const forbidden = { ok: false, error: "El horario no existe o no tienes permiso para modificarlo." } as const;

async function authorize(restaurantId: string) {
  if (!uuid.safeParse(restaurantId).success) return { ok: false, error: "Restaurante inválido." } as const;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Inicia sesión para administrar horarios." } as const;
  const { data, error } = await supabase.from("restaurant_members").select("role")
    .eq("restaurant_id", restaurantId).eq("user_id", user.id).eq("status", "ACTIVE").maybeSingle();
  if (error) return dbFailure(error, "schedules.authorize");
  if (!data || !["OWNER", "ADMIN"].includes(data.role)) {
    return { ok: false, error: "Solo el dueño o administrador puede administrar horarios." } as const;
  }
  return { ok: true, supabase } as const;
}

async function authorizeSchedule(restaurantId: string, scheduleId: string) {
  if (!uuid.safeParse(scheduleId).success) return { ok: false, error: "Horario inválido." } as const;
  const auth = await authorize(restaurantId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("schedules").select("id")
    .eq("id", scheduleId).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) return dbFailure(error, "schedules.find");
  if (!data) return forbidden;
  return auth;
}

async function refreshSchedules() {
  revalidatePath("/menu");
  await refreshPublicMenuTag();
}

export async function getSchedules(restaurantId: string): Promise<ActionResult<ScheduleWithShifts[]>> {
  const auth = await authorize(restaurantId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("schedules").select("*, schedule_shifts(*)")
    .eq("restaurant_id", restaurantId).order("name");
  if (error) return dbFailure(error, "getSchedules");
  return { ok: true, data: data ?? [] };
}

export async function createSchedule(restaurantId: string, input: unknown): Promise<ActionResult<ScheduleWithShifts>> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const auth = await authorize(restaurantId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("schedules")
    .insert({ restaurant_id: restaurantId, name: parsed.data.name }).select("*").single();
  if (error?.code === "23505") return { ok: false, error: "Ya existe un horario con ese nombre." };
  if (error) return dbFailure(error, "createSchedule");
  await refreshSchedules();
  return { ok: true, data: { ...data, schedule_shifts: [] } };
}

export async function updateSchedule(restaurantId: string, scheduleId: string, input: unknown): Promise<ActionResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const auth = await authorizeSchedule(restaurantId, scheduleId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("schedules").update(parsed.data)
    .eq("id", scheduleId).eq("restaurant_id", restaurantId).select("id");
  if (error?.code === "23505") return { ok: false, error: "Ya existe un horario con ese nombre." };
  if (error) return dbFailure(error, "updateSchedule");
  if (!data?.length) return forbidden;
  await refreshSchedules();
  return { ok: true, data: undefined };
}

export async function saveScheduleShift(
  restaurantId: string, scheduleId: string, input: unknown, shiftId?: string,
): Promise<ActionResult<ScheduleShift>> {
  const parsed = scheduleShiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (shiftId !== undefined && !uuid.safeParse(shiftId).success) return { ok: false, error: "Turno inválido." };
  const auth = await authorizeSchedule(restaurantId, scheduleId);
  if (!auth.ok) return auth;
  const { data: siblings, error: readError } = await auth.supabase.from("schedule_shifts")
    .select("*").eq("schedule_id", scheduleId);
  if (readError) return dbFailure(readError, "saveScheduleShift.read");
  if (shiftId && !siblings.some((shift) => shift.id === shiftId)) return forbidden;
  const checked = scheduleShiftsSchema.safeParse([
    ...siblings.filter((shift) => shift.id !== shiftId), parsed.data,
  ]);
  if (!checked.success) return { ok: false, error: checked.error.issues[0].message };
  const query = shiftId
    ? auth.supabase.from("schedule_shifts").update(parsed.data).eq("id", shiftId).eq("schedule_id", scheduleId)
    : auth.supabase.from("schedule_shifts").insert({ ...parsed.data, schedule_id: scheduleId });
  const { data, error } = await query.select("*").maybeSingle();
  if (error) return dbFailure(error, "saveScheduleShift");
  if (!data) return forbidden;
  await refreshSchedules();
  return { ok: true, data };
}

export async function deleteScheduleShift(restaurantId: string, scheduleId: string, shiftId: string): Promise<ActionResult> {
  if (!uuid.safeParse(shiftId).success) return { ok: false, error: "Turno inválido." };
  const auth = await authorizeSchedule(restaurantId, scheduleId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("schedule_shifts").delete()
    .eq("id", shiftId).eq("schedule_id", scheduleId).select("id");
  if (error) return dbFailure(error, "deleteScheduleShift");
  if (!data?.length) return forbidden;
  await refreshSchedules();
  return { ok: true, data: undefined };
}
