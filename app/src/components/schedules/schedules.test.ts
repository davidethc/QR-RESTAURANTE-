import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/schedules", () => ({
  getSchedules: vi.fn(), createSchedule: vi.fn(), updateSchedule: vi.fn(), saveScheduleShift: vi.fn(), deleteScheduleShift: vi.fn(),
}));
import { ScheduleEditor } from "./schedule-editor";
import { SchedulesManager } from "./schedules-manager";
import { SchedulesLoading } from "./schedules-loading";
import { isScheduleShiftDirty, scheduleTimeLabel } from "./schedule-display";
import type { ScheduleWithShifts } from "@/lib/actions/schedules";

const schedule: ScheduleWithShifts = {
  id: "schedule", restaurant_id: "restaurant", name: "Desayunos", created_at: "2026-10-21", updated_at: "2026-10-21",
  schedule_shifts: [{ id: "shift", schedule_id: "schedule", weekday: 1, starts_at: "08:00:00", ends_at: "12:00:00" }],
};

describe("horarios: presentación de datos guardados", () => {
  it("recorta TIME de PostgreSQL a minutos", () => {
    expect(scheduleTimeLabel("08:00:00")).toBe("08:00");
    expect(scheduleTimeLabel("23:59:00.000000")).toBe("23:59");
    expect(scheduleTimeLabel("09:30")).toBe("09:30");
  });
  it("compara pendientes a la precisión visible y detecta hora o día editados", () => {
    const saved = schedule.schedule_shifts[0];
    expect(isScheduleShiftDirty(saved, { ...saved, starts_at: "08:00", ends_at: "12:00" })).toBe(false);
    expect(isScheduleShiftDirty(saved, { ...saved, starts_at: "09:00" })).toBe(true);
    expect(isScheduleShiftDirty(saved, { ...saved, ends_at: "13:00" })).toBe(true);
    expect(isScheduleShiftDirty(saved, { ...saved, weekday: 0 })).toBe(true);
  });
  it("explica los días bloqueados antes de crear y deshabilita explícitamente + Turno", () => {
    const html = renderToStaticMarkup(createElement(ScheduleEditor, { restaurantId: "restaurant" }));
    expect(html).toContain("Crea el horario para agregar turnos.");
    expect(html).toContain("Cada turno se guarda por separado.");
    const buttons = [...html.matchAll(/<button\b[^>]*>\+ Turno<\/button>/g)];
    expect(buttons).toHaveLength(7);
    for (const [button] of buttons) expect(button).toContain('disabled=""');
    const summary = html.slice(html.indexOf('<aside'));
    expect(summary).toContain("Crea el horario para ver el resumen guardado.");
    expect(summary).not.toContain("Abierto 24 h");
  });
  it("muestra el turno persistido en HH:mm y usa input step=60", () => {
    const html = renderToStaticMarkup(createElement(ScheduleEditor, { restaurantId: "restaurant", initialSchedule: schedule }));
    expect(html).toContain("08:00 – 12:00");
    expect(html).not.toContain("08:00:00");
    expect(html.match(/step="60"/g)).toHaveLength(2);
    expect(html).not.toContain("Cambios sin guardar");
    expect(html).toContain('role="status"');
  });
});

describe("horarios: estados de la página", () => {
  it("ofrece crear en lista vacía sin montar un editor", () => {
    const html = renderToStaticMarkup(createElement(SchedulesManager, { restaurantId: "restaurant", initialResult: { ok: true, data: [] } }));
    expect(html).toContain("Todavía no hay horarios");
    expect(html).toContain("Crear horario");
    expect(html).not.toContain('aria-label="Editor de horario"');
  });
  it("ofrece Reintentar en error sin convertir el fallo en una lista vacía editable", () => {
    const html = renderToStaticMarkup(createElement(SchedulesManager, { restaurantId: "restaurant", initialResult: { ok: false, error: "Sin conexión" } }));
    expect(html).toContain("Reintentar");
    expect(html).toContain("Sin conexión");
    expect(html).not.toContain("Crear horario");
    expect(html).not.toContain('aria-label="Editor de horario"');
    expect(html).not.toContain("24 h");
  });
  it("carga con esqueleto sin inferir disponibilidad", () => {
    const html = renderToStaticMarkup(createElement(SchedulesLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Cargando horarios");
    expect(html).not.toContain("24 h");
    expect(html).not.toContain('aria-label="Editor de horario"');
  });
  it("monta el horario seleccionado cuando la carga fue correcta", () => {
    const html = renderToStaticMarkup(createElement(SchedulesManager, { restaurantId: "restaurant", initialResult: { ok: true, data: [schedule] } }));
    expect(html).toContain('aria-label="Editor de horario"');
    expect(html).toContain("Desayunos");
    expect(html).toContain("08:00 – 12:00");
  });
});
