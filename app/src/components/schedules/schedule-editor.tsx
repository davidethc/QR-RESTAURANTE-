"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Label } from "@/components/ui/label";
import { createSchedule, updateSchedule, saveScheduleShift, deleteScheduleShift } from "@/lib/actions/schedules";
import type { ScheduleShift, ScheduleWithShifts } from "@/lib/actions/schedules";
import { scheduleDays, scheduleDayStatus, scheduleSchema, scheduleShiftSchema, scheduleOverlapError } from "@/lib/validations/schedules";
import type { ScheduleShiftInput } from "@/lib/validations/schedules";
import type { ActionResult } from "@/types/actions";

type ScheduleEditorProps = {
  restaurantId: string;
  initialSchedule?: ScheduleWithShifts;
  onSaved?: (schedule: ScheduleWithShifts) => void;
};

/** Montar con key={initialSchedule?.id ?? "new"} al cambiar de horario. */
export function ScheduleEditor({ restaurantId, initialSchedule, onSaved }: ScheduleEditorProps) {
  const id = useId();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [name, setName] = useState(initialSchedule?.name ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const shifts = schedule?.schedule_shifts ?? [];
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [edits, setEdits] = useState<Record<string, ScheduleShiftInput>>({});
  const previewShifts = [
    ...shifts.map((shift) => edits[shift.id] ?? shift),
    ...draftDays.map((weekday) => edits[`draft-${weekday}`] ?? { weekday, starts_at: "08:00", ends_at: "12:00" }),
  ];

  function clearEdit(key: string) {
    setEdits((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function publish(next: ScheduleWithShifts) {
    setSchedule(next);
    onSaved?.(next);
  }

  function saveName() {
    setError("");
    setMessage("");
    const parsed = scheduleSchema.safeParse({ name });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    startTransition(async () => {
      try {
        if (schedule) {
          const result = await updateSchedule(restaurantId, schedule.id, parsed.data);
          if (!result.ok) { setError(result.error); return; }
          publish({ ...schedule, name: parsed.data.name });
        } else {
          const result = await createSchedule(restaurantId, parsed.data);
          if (!result.ok) { setError(result.error); return; }
          publish(result.data);
        }
        setName(parsed.data.name);
        setMessage("Horario guardado.");
      } catch { setError("No se pudo guardar el horario. Intenta de nuevo."); }
    });
  }

  async function saveShift(input: ScheduleShiftInput, shiftId?: string): Promise<ActionResult<ScheduleShift>> {
    if (!schedule) return { ok: false, error: "Crea el horario antes de agregar turnos." };
    if (saving.current) return { ok: false, error: "Espera a que termine el cambio anterior." };
    saving.current = true;
    setBusy(true);
    try {
      const result = await saveScheduleShift(restaurantId, schedule.id, input, shiftId);
      if (result.ok) {
        publish({ ...schedule, schedule_shifts: [...shifts.filter((shift) => shift.id !== shiftId), result.data] });
        clearEdit(shiftId ?? `draft-${input.weekday}`);
        if (!shiftId) setDraftDays((days) => days.filter((day) => day !== input.weekday));
      }
      return result;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function removeShift(shiftId: string): Promise<ActionResult> {
    if (!schedule) return { ok: false, error: "El horario no existe." };
    if (saving.current) return { ok: false, error: "Espera a que termine el cambio anterior." };
    saving.current = true;
    setBusy(true);
    try {
      const result = await deleteScheduleShift(restaurantId, schedule.id, shiftId);
      if (result.ok) {
        publish({ ...schedule, schedule_shifts: shifts.filter((shift) => shift.id !== shiftId) });
        clearEdit(shiftId);
      }
      return result;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label="Editor de horario" className="grid min-w-0 items-start gap-6 text-foreground lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 rounded-card border border-border bg-card">
        <form onSubmit={(event) => { event.preventDefault(); saveName(); }} className="space-y-3 border-b border-border p-5 sm:p-6">
          <h2 className="text-title-sm font-semibold">Nombre y alcance</h2>
          <Label htmlFor={`${id}-name`}>Nombre del horario</Label>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80}
            placeholder="Ej. Desayunos" className="min-h-11" disabled={pending || busy}
            aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
          {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-sm text-muted-foreground">Este horario se puede asignar a categorías del menú. Hora local del restaurante.</p>
          <Button type="submit" className="min-h-11" disabled={pending || busy}>{pending ? "Guardando…" : schedule ? "Guardar nombre" : "Crear horario"}</Button>
          <p role="status" className="text-sm text-muted-foreground">{message}</p>
        </form>
        <div className="space-y-4 p-5 sm:p-6">
          <h2 className="text-title-sm font-semibold">Turnos de la semana</h2>
          <p className={`rounded-control p-4 text-sm ${previewShifts.length === 0 ? "bg-warning-soft text-warning-soft-foreground" : "bg-info-soft text-info-soft-foreground"}`}>
            {previewShifts.length === 0 ? "El horario permanecerá abierto las 24 horas hasta que agregues un turno." : "Solo se aplican los turnos configurados. Los días sin turnos no tienen atención en este horario."}
          </p>
          <fieldset disabled={!schedule || pending || busy} className="min-w-0 divide-y divide-border">
            <legend className="sr-only">Turnos por día</legend>
            {scheduleDays.map((day) => (
              <section key={day.weekday} aria-label={day.label} className="min-w-0 space-y-3 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{day.label}</h3>
                  <Button type="button" variant="outline" className="min-h-11" disabled={draftDays.includes(day.weekday)}
                    aria-label={`Agregar turno del ${day.label.toLowerCase()}`}
                    onClick={() => setDraftDays((days) => [...days, day.weekday])}>+ Turno</Button>
                </div>
                {shifts.filter((shift) => shift.weekday === day.weekday).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((shift) => (
                  <ShiftRow key={shift.id} day={day.label} weekday={day.weekday} shift={shift} lastShift={shifts.length === 1}
                    onSave={saveShift} onRemove={removeShift} onChange={(value) => setEdits((previous) => ({ ...previous, [shift.id]: value }))} />
                ))}
                {draftDays.includes(day.weekday) && <ShiftRow day={day.label} weekday={day.weekday} onSave={saveShift} onRemove={removeShift}
                  onChange={(value) => setEdits((previous) => ({ ...previous, [`draft-${day.weekday}`]: value }))}
                  onCancel={() => { setDraftDays((days) => days.filter((weekday) => weekday !== day.weekday)); clearEdit(`draft-${day.weekday}`); }} />}
                {!previewShifts.some((shift) => shift.weekday === day.weekday) && <p className="text-sm text-muted-foreground">
                  {previewShifts.length === 0 ? "Abierto 24 h" : "Sin atención en este horario"}
                </p>}
              </section>
            ))}
          </fieldset>
        </div>
      </div>
      <aside aria-label="Resumen del horario" className="min-w-0 space-y-4 rounded-card border border-border bg-card p-5 sm:p-6 lg:sticky lg:top-6">
        <p className="text-sm text-muted-foreground">Disponibilidad de las categorías</p>
        <h2 className="break-words text-title-sm font-semibold">{name || "Nombre del horario"}</h2>
        <Badge variant="secondary">{previewShifts.length === 0 ? "Abierto 24 h" : "Con turnos"}</Badge>
        <dl className="divide-y divide-border border-y border-border">
          {scheduleDays.map((day) => {
            const dayShifts = previewShifts.filter((shift) => shift.weekday === day.weekday);
            return <div key={day.weekday} className="space-y-1 py-3">
              <dt className="font-medium">{day.label}</dt>
              <dd className="text-sm text-muted-foreground">{dayShifts.length ? dayShifts.map((shift) => `${shift.starts_at} – ${shift.ends_at}${shift.ends_at < shift.starts_at ? " (Termina al día siguiente)" : ""}`).join(" / ") : scheduleDayStatus(previewShifts, day.weekday)}</dd>
            </div>;
          })}
        </dl>
        <p className="text-sm text-muted-foreground">{previewShifts.length === 0 ? "El horario permanecerá abierto las 24 horas hasta que agregues un turno." : "Con turnos definidos, solo se aplican los intervalos configurados."}</p>
      </aside>
    </section>
  );
}

function ShiftRow({ day, weekday, shift, lastShift, onSave, onRemove, onChange, onCancel }: {
  day: string;
  weekday: number;
  shift?: ScheduleShift;
  lastShift?: boolean;
  onSave: (input: ScheduleShiftInput, shiftId?: string) => Promise<ActionResult<ScheduleShift>>;
  onRemove: (shiftId: string) => Promise<ActionResult>;
  onChange: (input: ScheduleShiftInput) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [start, setStart] = useState(shift?.starts_at ?? "08:00");
  const [end, setEnd] = useState(shift?.ends_at ?? "12:00");
  const [errors, setErrors] = useState<{ starts_at?: string; ends_at?: string; general?: string }>({});
  const [pending, startTransition] = useTransition();

  function change(field: "starts_at" | "ends_at", value: string) {
    if (field === "starts_at") setStart(value); else setEnd(value);
    setErrors({});
    onChange({ weekday, starts_at: field === "starts_at" ? value : start, ends_at: field === "ends_at" ? value : end });
  }

  async function remove(): Promise<ActionResult> {
    setErrors({});
    try {
      if (!shift) { onCancel?.(); return { ok: true, data: undefined }; }
      const result = await onRemove(shift.id);
      if (!result.ok) setErrors({ general: result.error });
      return result;
    } catch {
      const error = "No se pudo guardar el cambio. Intenta de nuevo.";
      setErrors({ general: error });
      return { ok: false, error };
    }
  }

  function save() {
    setErrors({});
    const parsed = scheduleShiftSchema.safeParse({ weekday, starts_at: start, ends_at: end });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] === "ends_at" ? "ends_at" : "starts_at";
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    startTransition(async () => {
      try {
        const result = await onSave(parsed.data, shift?.id);
        if (!result.ok) setErrors(result.error === scheduleOverlapError ? { starts_at: result.error } : { general: result.error });
      } catch { setErrors({ general: "No se pudo guardar el cambio. Intenta de nuevo." }); }
    });
  }

  return (
    <fieldset disabled={pending} className="min-w-0 space-y-2 border-b border-border py-4">
      <legend className="sr-only">{shift ? "Editar turno" : "Nuevo turno"} de {day}</legend>
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-start`}>Desde</Label>
          <Input id={`${id}-start`} type="time" step="any" value={start} onChange={(event) => change("starts_at", event.target.value)} className="min-h-11"
            aria-label={`Desde, ${day}`} aria-invalid={Boolean(errors.starts_at)} aria-describedby={errors.starts_at ? `${id}-start-error` : undefined} />
          {errors.starts_at && <p id={`${id}-start-error`} role="alert" className="text-sm text-destructive">{errors.starts_at}</p>}
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-end`}>Hasta</Label>
          <Input id={`${id}-end`} type="time" step="any" value={end} onChange={(event) => change("ends_at", event.target.value)} className="min-h-11"
            aria-label={`Hasta, ${day}`} aria-invalid={Boolean(errors.ends_at)} aria-describedby={`${id}-hint${errors.ends_at ? ` ${id}-end-error` : ""}`} />
          <p id={`${id}-hint`} aria-live="polite" className="text-sm text-muted-foreground">{start && end && end < start ? "Termina al día siguiente" : ""}</p>
          {errors.ends_at && <p id={`${id}-end-error`} role="alert" className="text-sm text-destructive">{errors.ends_at}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={save}>{pending ? "Guardando…" : shift ? "Guardar turno" : "Agregar turno"}</Button>
        {shift && lastShift ? <ConfirmDialog
          trigger={<Button type="button" variant="ghost" className="min-h-11 text-destructive" aria-label={`Quitar turno del ${day.toLowerCase()}`}>Quitar</Button>}
          title="¿Dejar el horario abierto 24 horas?"
          description="Vas a quitar el último turno. El horario quedará abierto todos los días, las 24 horas."
          cancelLabel="Conservar turno" confirmLabel="Quitar y abrir 24 h" action={remove}
        /> : <Button type="button" variant="ghost" className="min-h-11 text-destructive" aria-label={`Quitar turno del ${day.toLowerCase()}`}
          onClick={() => startTransition(async () => { await remove(); })}>Quitar</Button>}
      </div>
      {errors.general && <p role="alert" className="text-sm text-destructive">{errors.general}</p>}
    </fieldset>
  );
}
