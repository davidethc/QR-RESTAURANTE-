"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { getSchedules } from "@/lib/actions/schedules";
import type { ScheduleWithShifts } from "@/lib/actions/schedules";
import type { ActionResult } from "@/types/actions";
import { ScheduleEditor } from "./schedule-editor";
import { SchedulesLoading } from "./schedules-loading";

export function ScheduleLoadError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div role="alert" className="space-y-4 rounded-card border border-border bg-card p-6">
      <h2 className="text-title-sm font-semibold">No se pudieron cargar los horarios</h2>
      <p className="text-sm text-muted-foreground">{message || "Reintenta para consultar los horarios guardados."}</p>
      <Button type="button" className="min-h-11" onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

export function SchedulesManager({ restaurantId, initialResult }: {
  restaurantId: string;
  initialResult: ActionResult<ScheduleWithShifts[]>;
}) {
  const [result, setResult] = useState(initialResult);
  const [selectedId, setSelectedId] = useState<string | null>(initialResult.ok ? initialResult.data[0]?.id ?? null : null);
  const [creating, setCreating] = useState(false);
  const [loading, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      try {
        const next = await getSchedules(restaurantId);
        setResult(next);
        setSelectedId(next.ok ? next.data[0]?.id ?? null : null);
        setCreating(false);
      } catch {
        setResult({ ok: false, error: "No se pudieron consultar los horarios. Revisa la conexión y reintenta." });
      }
    });
  }

  if (loading) return <SchedulesLoading />;
  if (!result.ok) return <ScheduleLoadError onRetry={retry} message={result.error} />;
  const schedules = result.data;
  if (!creating && schedules.length === 0) {
    return <EmptyState title="Todavía no hay horarios" description="Al crear uno sin turnos, quedará abierto todos los días las 24 horas."
      action={<Button type="button" className="min-h-11" onClick={() => setCreating(true)}>Crear horario</Button>} />;
  }
  const selected = schedules.find((schedule) => schedule.id === selectedId);

  function saved(schedule: ScheduleWithShifts) {
    setResult((previous) => {
      if (!previous.ok) return previous;
      const exists = previous.data.some((item) => item.id === schedule.id);
      return { ok: true, data: exists ? previous.data.map((item) => item.id === schedule.id ? schedule : item) : [...previous.data, schedule] };
    });
    setSelectedId(schedule.id);
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Horarios del menú" className="flex flex-wrap gap-2">
        {schedules.map((schedule) => <Button key={schedule.id} type="button" className="min-h-11 max-w-full whitespace-normal break-words"
          variant={!creating && schedule.id === selectedId ? "secondary" : "outline"}
          aria-pressed={!creating && schedule.id === selectedId}
          onClick={() => { setSelectedId(schedule.id); setCreating(false); }}>{schedule.name}</Button>)}
        <Button type="button" variant="outline" className="min-h-11" aria-pressed={creating}
          onClick={() => setCreating(true)}>Crear horario</Button>
      </nav>
      {(creating || selected) && <ScheduleEditor key={creating ? "new" : selected!.id} restaurantId={restaurantId}
        initialSchedule={creating ? undefined : selected} onSaved={saved} />}
    </div>
  );
}
