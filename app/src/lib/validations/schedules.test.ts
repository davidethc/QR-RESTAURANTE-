import { describe, expect, it } from "vitest";
import { isScheduleOpen, scheduleDays, scheduleDayStatus, scheduleSchema, scheduleShiftsSchema, scheduleShiftSchema } from "./schedules";

const shift = (weekday = 1, starts_at = "09:00", ends_at = "17:00") => ({ weekday, starts_at, ends_at });

describe("A1: horarios sin turnos", () => {
  it("abre 24 horas todos los días si no hay ningún turno", () => {
    expect(scheduleShiftsSchema.safeParse([]).success).toBe(true);
    for (let day = 0; day < 7; day++) {
      expect(scheduleDayStatus([], day)).toBe("24 horas");
      expect(isScheduleOpen([], day, "23:59")).toBe(true);
    }
  });
  it("cierra los días sin turnos cuando otros días tienen turnos", () => {
    expect(scheduleDayStatus([shift()], 0)).toBe("Cerrado");
    expect(isScheduleOpen([shift()], 0, "12:00")).toBe(false);
    expect(isScheduleOpen([shift()], 1, "09:00")).toBe(true);
    expect(isScheduleOpen([shift()], 1, "17:00")).toBe(false);
  });
});

describe("B2: medianoche", () => {
  it("conserva el día de inicio y continúa hasta el siguiente día", () => {
    const night = shift(5, "20:00", "02:00");
    expect(scheduleShiftSchema.parse(night).weekday).toBe(5);
    expect(isScheduleOpen([night], 5, "23:00")).toBe(true);
    expect(isScheduleOpen([night], 6, "01:59")).toBe(true);
    expect(isScheduleOpen([night], 6, "02:00")).toBe(false);
    expect(isScheduleOpen([night], 5, "01:00")).toBe(false);
  });
  it("continúa de sábado a domingo", () => {
    expect(isScheduleOpen([shift(6, "22:00", "02:00")], 0, "01:00")).toBe(true);
  });
  it("rechaza inicio y fin iguales incluso con segundos explícitos", () => {
    const result = scheduleShiftSchema.safeParse(shift(1, "09:00", "09:00:00"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({
      path: ["ends_at"], message: "La hora final no puede ser igual al inicio.",
    });
  });
});

describe("C1: días", () => {
  it("muestra lunes a domingo y conserva domingo = 0", () => {
    expect(scheduleDays.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(scheduleDays[6].label).toBe("Domingo");
    expect(scheduleShiftSchema.safeParse(shift(0)).success).toBe(true);
    for (const day of [-1, 7, 1.5]) expect(scheduleShiftSchema.safeParse(shift(day)).success).toBe(false);
  });
});

describe("turnos superpuestos", () => {
  it("rechaza duplicados, intersecciones y turnos contenidos", () => {
    for (const other of [shift(), shift(1, "08:00", "10:00"), shift(1, "10:00", "11:00")]) {
      expect(scheduleShiftsSchema.safeParse([shift(), other]).success).toBe(false);
    }
  });
  it("rechaza intersecciones de turnos nocturnos del mismo día", () => {
    expect(scheduleShiftsSchema.safeParse([shift(1, "22:00", "02:00"), shift(1, "23:00", "03:00")]).success).toBe(false);
  });
  it("rechaza la cola del día anterior, incluido domingo → lunes, en ambos órdenes", () => {
    for (let day = 0; day < 7; day++) {
      const night = shift(day, "22:00", "02:00");
      const next = shift((day + 1) % 7, "01:00", "03:00");
      for (const shifts of [[night, next], [next, night]]) {
        const result = scheduleShiftsSchema.safeParse(shifts);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0]).toMatchObject({
          path: [1, "starts_at"],
          message: "Este turno se superpone con otro, incluido el que termina al día siguiente.",
        });
      }
    }
  });
  it("permite intervalos contiguos al fin de una cola nocturna en cualquier día", () => {
    for (let day = 0; day < 7; day++) {
      expect(scheduleShiftsSchema.safeParse([
        shift(day, "22:00", "02:00"), shift((day + 1) % 7, "02:00", "04:00"),
      ]).success).toBe(true);
    }
  });
  it("permite límites contiguos, distintos días y horas tempranas del día de inicio", () => {
    for (const shifts of [[shift(), shift(1, "17:00", "20:00")], [shift(), shift(2)], [shift(1, "01:00", "03:00"), shift(1, "22:00", "02:00")]]) {
      expect(scheduleShiftsSchema.safeParse(shifts).success).toBe(true);
    }
  });
});

it("valida nombre y horas sin aceptar valores fuera de rango", () => {
  expect(scheduleSchema.parse({ name: " Desayunos " }).name).toBe("Desayunos");
  expect(scheduleSchema.safeParse({ name: " " }).success).toBe(false);
  expect(scheduleSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  for (const time of ["24:00", "12:60", "9:00", ""]) expect(scheduleShiftSchema.safeParse(shift(1, time)).success).toBe(false);
});
