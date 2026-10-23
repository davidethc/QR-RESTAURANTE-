"use client";

import { useId, useState, useTransition } from "react";
import { Flame, Settings2, TimerReset, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications";
import { setKdsSettings } from "@/lib/actions/kds";
import type { KdsThresholds } from "@/lib/kds";
import { cn } from "@/lib/utils";

/** Botón de la franja que abre o cierra el panel de tiempos. */
function Trigger({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button variant="outline" aria-expanded={open} className={cn("min-h-12 px-4", open && "bg-secondary")} onClick={onToggle}>
      <Settings2 aria-hidden className="size-4" /> Tiempos
    </Button>
  );
}

/** Umbrales del cronómetro (solo OWNER/ADMIN; la RPC lo vuelve a validar). */
export function KdsSettings({
  restaurantId,
  thresholds,
  onSaved,
  onClose,
}: {
  restaurantId: string;
  thresholds: KdsThresholds;
  onSaved: () => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [warn, setWarn] = useState(String(thresholds.warn_minutes));
  const [alert, setAlert] = useState(String(thresholds.alert_minutes));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const r = await setKdsSettings({
        restaurantId,
        warnMinutes: Number(warn),
        alertMinutes: Number(alert),
      });
      if (!r.ok) return setError(r.error);
      notify.success("Tiempos guardados");
      onClose();
      onSaved();
    });
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4 shadow-sm"
    >
      <div className="w-full sm:w-auto sm:flex-1">
        <h2 id={`${ids}-title`} className="text-body font-semibold text-foreground">Tiempos del cronómetro</h2>
        <p className="text-body-sm text-muted-foreground">Desde qué minuto una comanda se marca demorada o atrasada.</p>
      </div>
      <label className="flex flex-col gap-1 text-body-sm font-medium text-foreground">
        <span className="flex items-center gap-1.5 text-attention-soft-foreground">
          <TimerReset aria-hidden className="size-4" /> Demorada desde (min)
        </span>
        <Input inputMode="numeric" className="h-12 w-32 text-body-lg tabular-nums" value={warn} onChange={(e) => setWarn(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-body-sm font-medium text-foreground">
        <span className="flex items-center gap-1.5 text-money-out-soft-foreground">
          <Flame aria-hidden className="size-4" /> Atrasada desde (min)
        </span>
        <Input inputMode="numeric" className="h-12 w-32 text-body-lg tabular-nums" value={alert} onChange={(e) => setAlert(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button className="min-h-12 px-5" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="ghost" className="min-h-12 px-4" onClick={onClose}>
          <X aria-hidden className="size-4" /> Cancelar
        </Button>
      </div>
      {error && <p role="alert" className="w-full text-body-sm text-destructive">{error}</p>}
    </section>
  );
}

KdsSettings.Trigger = Trigger;
