import { z } from "zod";

export const scheduleEqualTimeError = "La hora final no puede ser igual al inicio.";
export const scheduleOverlapError = "Este turno se superpone con otro, incluido el que termina al día siguiente.";

export const scheduleDays = [
  { weekday: 1, label: "Lunes" },
  { weekday: 2, label: "Martes" },
  { weekday: 3, label: "Miércoles" },
  { weekday: 4, label: "Jueves" },
  { weekday: 5, label: "Viernes" },
  { weekday: 6, label: "Sábado" },
  { weekday: 0, label: "Domingo" },
] as const;

// Admite también el formato TIME devuelto por PostgreSQL, sin perder segundos.
const timeSchema = z.string({ error: "Ingresa una hora válida" }).regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/,
  "Ingresa una hora válida (HH:mm)",
);

export const scheduleSchema = z.object({
  name: z.string({ error: "El nombre es obligatorio" }).trim().min(1, "El nombre es obligatorio").max(80, "Usa hasta 80 caracteres"),
}, { error: "Ingresa los datos del horario" });

export const scheduleShiftSchema = z.object({
  weekday: z.number({ error: "Elige un día válido" }).int("Elige un día válido").min(0, "Elige un día válido").max(6, "Elige un día válido"),
  starts_at: timeSchema,
  ends_at: timeSchema,
}, { error: "Ingresa los datos del turno" }).refine((shift) => seconds(shift.starts_at) !== seconds(shift.ends_at), {
  message: scheduleEqualTimeError,
  path: ["ends_at"],
});

export type ScheduleShiftInput = z.infer<typeof scheduleShiftSchema>;

function seconds(time: string): number {
  const [hours, minutes, secs = 0] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + secs;
}

function interval(shift: ScheduleShiftInput): [number, number] {
  const start = seconds(shift.starts_at);
  const end = seconds(shift.ends_at);
  return [start, end < start ? end + 86400 : end];
}

export const scheduleShiftsSchema = z.array(scheduleShiftSchema, { error: "Ingresa una lista de turnos" }).superRefine((shifts, ctx) => {
  shifts.forEach((shift, index) => {
    const [start, end] = interval(shift).map((time) => time + shift.weekday * 86400);
    if (shifts.slice(0, index).some((other) => {
      const [otherStart, otherEnd] = interval(other).map((time) => time + other.weekday * 86400);
      const week = 7 * 86400;
      return [-week, 0, week].some((offset) => start < otherEnd + offset && otherStart + offset < end);
    })) {
      ctx.addIssue({ code: "custom", path: [index, "starts_at"], message: scheduleOverlapError });
    }
  });
});

export function scheduleDayStatus(shifts: readonly ScheduleShiftInput[], weekday: number) {
  if (shifts.length === 0) return "24 horas";
  return shifts.some((shift) => shift.weekday === weekday) ? "Con turnos" : "Cerrado";
}

export function isScheduleOpen(shifts: readonly ScheduleShiftInput[], weekday: number, time: string): boolean {
  if (shifts.length === 0) return true;
  const now = seconds(time);
  return shifts.some((shift) => {
    const [start, end] = interval(shift);
    return (shift.weekday === weekday && now >= start && now < end)
      || ((shift.weekday + 1) % 7 === weekday && end > 86400 && now < end - 86400);
  });
}
