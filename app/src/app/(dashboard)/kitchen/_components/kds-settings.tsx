"use client";

import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications";
import { setKdsSettings } from "@/lib/actions/kds";
import type { KdsThresholds } from "@/lib/kds";

/** Umbrales del cronómetro (solo OWNER/ADMIN; la RPC lo vuelve a validar). */
export function KdsSettings({
  restaurantId,
  thresholds,
  onSaved,
}: {
  restaurantId: string;
  thresholds: KdsThresholds;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      onSaved();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" className="min-h-11 px-4" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden className="size-4" /> Tiempos
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-3">
      <label className="flex flex-col gap-1 text-body-sm">
        Amarillo desde (min)
        <Input inputMode="numeric" className="h-11 w-28" value={warn} onChange={(e) => setWarn(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-body-sm">
        Rojo desde (min)
        <Input inputMode="numeric" className="h-11 w-28" value={alert} onChange={(e) => setAlert(e.target.value)} />
      </label>
      <Button className="min-h-11 px-4" onClick={save} disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      <Button variant="ghost" className="min-h-11 px-4" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      {error && <p role="alert" className="w-full text-body-sm text-destructive">{error}</p>}
    </div>
  );
}
