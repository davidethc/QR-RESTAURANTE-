"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ModifierDraft } from "./modifier-model";

const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

export function ModifierPreview({ draft }: { draft: ModifierDraft }) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [tested, setTested] = useState(false);
  const total = Object.values(selected).reduce((sum, quantity) => sum + quantity, 0);
  const min = Math.max(0, Number(draft.min_select) || 0);
  const max = Math.max(0, Math.floor(Number(draft.max_select) || 0));
  const atMax = total >= max;

  function choose(key: string, delta: number) {
    if (delta > 0 && atMax) return;
    setSelected((previous) => ({ ...previous, [key]: Math.max(0, (previous[key] ?? 0) + delta) }));
    setTested(false);
  }

  return <Card className="min-w-0 gap-4 bg-muted lg:sticky lg:top-0" aria-label="Vista previa de la personalización">
    <CardHeader><CardDescription>Así lo verá quien pide</CardDescription><CardTitle className="text-title wrap-anywhere">{draft.name || "Instrucción para el cliente"}</CardTitle><p className="text-body-sm text-muted-foreground">{min === 0 ? "Opcional" : "Obligatorio"} · Elige de {min} a {max}{draft.allow_repeat ? " · Puedes repetir" : ""}</p></CardHeader>
    <CardContent className="space-y-4">
      <div className="divide-y rounded-control border bg-card px-3">
        {draft.options.map((option, index) => {
          const name = option.name || `Opción ${index + 1}`;
          const qty = selected[option.key] ?? 0;
          const price = Number(option.price.replace(",", "."));
          return <div key={option.key} className="space-y-2 py-3">
            <p className="text-body-sm font-medium wrap-anywhere">{name}<span className="ml-2 font-normal text-muted-foreground">{Number.isFinite(price) && price >= 0 ? money.format(price) : "Precio pendiente"}</span></p>
            {draft.allow_repeat ? <div className="flex items-center gap-3"><Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Quitar uno de ${name}`} disabled={!qty} onClick={() => choose(option.key, -1)}><Minus aria-hidden /></Button><span className="min-w-6 text-center tabular-nums" aria-label={`Cantidad de ${name}`}>{qty}</span><Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Agregar uno de ${name}`} disabled={atMax} onClick={() => choose(option.key, 1)}><Plus aria-hidden /></Button></div>
              : <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm"><Checkbox checked={!!qty} disabled={!qty && atMax} onCheckedChange={(checked) => choose(option.key, checked ? 1 : -1)} /><span className="wrap-anywhere">Elegir {name}</span></label>}
          </div>;
        })}
      </div>
      <p role="status" className="text-body-sm text-muted-foreground">{total} de {max} seleccionadas{atMax ? " · Alcanzaste el máximo" : ""}{tested && total >= min ? " · Selección válida" : ""}</p>
      <FieldError>{tested && total < min ? `Elige al menos ${min} ${min === 1 ? "opción" : "opciones"}.` : ""}</FieldError>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setTested(true)}>Probar selección</Button>
    </CardContent>
  </Card>;
}
