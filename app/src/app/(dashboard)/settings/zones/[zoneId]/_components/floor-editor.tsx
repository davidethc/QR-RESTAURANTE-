"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Armchair, ArrowLeft, Circle, Info, LayoutGrid, Loader2, Minus, Plus, Save, Settings2, Square, Trash2 } from "lucide-react";
import { posPressable, toneSolid } from "@/components/shared/pos-tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { createTableInCell, deleteTable, moveTable, updateZone } from "@/lib/actions/zones";
import type { ZoneRow, ZoneTable } from "@/lib/queries/zones";

type Draft = {
  id: string;
  number: number;
  shape: "square" | "round";
  col: number;
  row: number;
  widthCells: number;
  heightCells: number;
};

function toDraft(t: ZoneTable): Draft {
  return {
    id: t.id,
    number: t.number,
    shape: t.shape,
    col: t.col ?? 0,
    row: t.row ?? 0,
    widthCells: t.widthCells,
    heightCells: t.heightCells,
  };
}

function overlaps(a: Draft, b: ZoneTable) {
  if (b.col === null || b.row === null || b.id === a.id) return false;
  return (
    a.col < b.col + b.widthCells &&
    b.col < a.col + a.widthCells &&
    a.row < b.row + b.heightCells &&
    b.row < a.row + a.heightCells
  );
}

function Stepper({
  label,
  value,
  onChange,
  min = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body-sm">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          className="size-11"
          aria-label={`Reducir ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <span className="w-9 text-center font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          className="size-11"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function GridSizeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={30}
          value={value}
          aria-label={`${label} (deslizador)`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 min-w-0 flex-1 accent-primary"
        />
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={30}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
          className="min-h-11 w-20"
        />
      </div>
    </div>
  );
}

export function FloorEditor({ zone, tables }: { zone: ZoneRow; tables: ZoneTable[] }) {
  const router = useRouter();
  const [name, setName] = useState(zone.name);
  const [cols, setCols] = useState(zone.gridCols);
  const [rows, setRows] = useState(zone.gridRows);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const placed = tables.filter((t) => t.col !== null && t.row !== null);
  const unplaced = tables.filter((t) => t.col === null || t.row === null);
  const selected = draft ? (tables.find((t) => t.id === draft.id) ?? null) : null;
  const effectiveDraft = selected ? draft : null;

  const clash =
    effectiveDraft &&
    (tables.some((t) => overlaps(effectiveDraft, t)) ||
      effectiveDraft.col + effectiveDraft.widthCells > cols ||
      effectiveDraft.row + effectiveDraft.heightCells > rows);

  function covered(c: number, r: number) {
    return placed.some(
      (t) =>
        c >= t.col! && c < t.col! + t.widthCells && r >= t.row! && r < t.row! + t.heightCells
    );
  }

  function fail(message: string) {
    setError(message);
    notify.error(message);
  }

  function addAt(col: number, row: number) {
    setError(null);
    start(async () => {
      const r = await createTableInCell({ zoneId: zone.id, col, row });
      if (!r.ok) return fail(r.error);
      setDraft(null);
      router.refresh();
      setDraft({
        id: r.data,
        number: 0,
        shape: "square",
        col,
        row,
        widthCells: 1,
        heightCells: 1,
      });
    });
  }

  function addFirstFree() {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (!covered(c, r)) return addAt(c, r);
    fail("No hay celdas libres. Aumenta las columnas o filas.");
  }

  function select(t: ZoneTable) {
    setError(null);
    setDraft(toDraft(t));
  }

  function save() {
    setError(null);
    start(async () => {
      if (name !== zone.name || cols !== zone.gridCols || rows !== zone.gridRows) {
        const z = await updateZone({ zoneId: zone.id, name, gridCols: cols, gridRows: rows });
        if (!z.ok) return fail(z.error);
      }
      if (effectiveDraft && selected) {
        const d = effectiveDraft;
        const t = await moveTable({
          tableId: d.id,
          col: d.col,
          row: d.row,
          widthCells: d.widthCells,
          heightCells: d.heightCells,
          shape: d.shape,
          number: d.number || selected.number,
        });
        if (!t.ok) return fail(t.error);
      }
      notify.success("Plano guardado");
      router.refresh();
    });
  }

  const d = effectiveDraft;
  const patch = (p: Partial<Draft>) => d && setDraft({ ...d, ...p });

  return (
    <div data-caja className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-3 md:px-5">
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/settings">
            <ArrowLeft /> Salir
          </Link>
        </Button>
        <span aria-hidden className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-info text-white sm:flex">
          <LayoutGrid className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-body font-semibold leading-tight text-foreground">
            {name || "Zona sin nombre"}
          </h1>
          <p className="truncate text-meta leading-tight text-muted-foreground">
            {tables.length} {tables.length === 1 ? "mesa" : "mesas"} · plano de {cols} × {rows}
          </p>
        </div>
        <Button onClick={save} disabled={pending} className={cn(posPressable, toneSolid["money-in"], "min-h-11 px-5")}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </header>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 border-b border-money-out-border bg-money-out-soft px-4 py-2.5 text-body-sm text-money-out-soft-foreground"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-border p-4 md:w-80 md:overflow-y-auto md:border-b-0 md:border-r">
          <section aria-labelledby="zone-panel" className="flex flex-col gap-4 rounded-card border border-border bg-card p-4">
          <h2 id="zone-panel" className="flex items-center gap-2 text-body font-semibold text-foreground">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden /> Zona
          </h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zone-name-edit">Nombre de zona</Label>
            <Input
              id="zone-name-edit"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11"
            />
          </div>
          <GridSizeField label="Columnas" value={cols} onChange={setCols} />
          <GridSizeField label="Filas" value={rows} onChange={setRows} />
          </section>

          {unplaced.length > 0 && (
            <section aria-labelledby="unplaced-panel" className="hidden flex-col gap-3 rounded-card border border-attention-border bg-card p-4 md:flex">
              <div>
                <h2 id="unplaced-panel" className="flex items-center gap-2 text-body font-semibold text-foreground">
                  <AlertTriangle className="size-4 text-attention-soft-foreground" aria-hidden /> Mesas sin colocar
                </h2>
                <p className="text-meta text-muted-foreground">Elige una y ponle columna y fila para que aparezca en el plano.</p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {unplaced.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => select(t)}
                      aria-pressed={d?.id === t.id}
                      className={cn(
                        posPressable,
                        "flex min-h-11 items-center rounded-control border-2 px-3 text-body-sm font-semibold tabular-nums",
                        d?.id === t.id ? "border-foreground bg-foreground text-background" : "border-attention-border bg-attention-soft text-attention-soft-foreground"
                      )}
                    >
                      Mesa {t.number}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d ? (
            <section aria-labelledby="table-panel" className="flex flex-col gap-4 rounded-card border-2 border-foreground bg-card p-4 shadow-sm">
              <h2 id="table-panel" className="flex items-center gap-2 text-body font-semibold text-foreground">
                <Armchair className="size-4 text-muted-foreground" aria-hidden /> Mesa {d.number || selected?.number}
              </h2>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="table-number">Identificador de mesa</Label>
                <Input
                  id="table-number"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={d.number || selected?.number || ""}
                  onChange={(e) => patch({ number: Number(e.target.value) })}
                  className="min-h-11"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Forma</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["square", "round"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={d.shape === s}
                      className={cn(
                        posPressable,
                        "flex min-h-12 items-center justify-center gap-2 rounded-control border-2 text-body-sm font-semibold",
                        d.shape === s ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-border-strong"
                      )}
                      onClick={() => patch({ shape: s })}
                    >
                      {s === "square" ? <Square className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
                      {s === "square" ? "Cuadrada" : "Redonda"}
                    </button>
                  ))}
                </div>
              </div>
              <Stepper label="Ancho" value={d.widthCells} onChange={(n) => patch({ widthCells: n })} />
              <Stepper label="Alto" value={d.heightCells} onChange={(n) => patch({ heightCells: n })} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="t-col">Columna</Label>
                  <Input
                    id="t-col"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={d.col + 1}
                    onChange={(e) => patch({ col: Math.max(0, Number(e.target.value) - 1) })}
                    className="min-h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="t-row">Fila</Label>
                  <Input
                    id="t-row"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={d.row + 1}
                    onChange={(e) => patch({ row: Math.max(0, Number(e.target.value) - 1) })}
                    className="min-h-11"
                  />
                </div>
              </div>
              {clash && (
                <p role="alert" className="flex gap-2 rounded-control border border-money-out-border bg-money-out-soft p-2.5 text-meta text-money-out-soft-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Esta mesa se solapa con otra o se sale de la cuadrícula. Ajusta la posición o el
                  tamaño antes de guardar.
                </p>
              )}
              <ConfirmDialog
                destructive
                title={`¿Borrar la mesa ${selected?.number}?`}
                description="No se puede borrar una mesa con sesión activa."
                confirmLabel="Borrar"
                successMessage="Mesa borrada"
                action={() => deleteTable(d.id)}
                onSuccess={() => {
                  setDraft(null);
                  setError(null);
                  router.refresh();
                }}
                onError={setError}
                trigger={
                  <Button variant="outline" className="min-h-11 text-money-out-soft-foreground hover:text-money-out-soft-foreground">
                    <Trash2 /> Borrar mesa
                  </Button>
                }
              />
            </section>
          ) : (
            <p className="flex gap-2 rounded-card border border-info-border bg-info-soft p-3 text-body-sm text-info-soft-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Toca una mesa para editarla o un “+” para crear una nueva.
            </p>
          )}
        </aside>

        <main className="min-w-0 flex-1 p-4 md:overflow-auto">
          {/* Cuadrícula: solo cuando cabe (pantallas medianas en adelante). */}
          <div className="hidden rounded-card border border-border bg-card p-3 md:block">
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(56px, 1fr))`,
                gridAutoRows: "minmax(56px, auto)",
              }}
            >
              {Array.from({ length: rows }).flatMap((_, r) =>
                Array.from({ length: cols }).map((__, c) =>
                  covered(c, r) ? null : (
                    <button
                      key={`${c}-${r}`}
                      type="button"
                      disabled={pending}
                      aria-label={`Crear mesa en columna ${c + 1}, fila ${r + 1}`}
                      onClick={() => addAt(c, r)}
                      style={{ gridColumn: c + 1, gridRow: r + 1 }}
                      className="flex min-h-14 items-center justify-center rounded-control border border-dashed border-border bg-background text-muted-foreground/60 transition-colors duration-150 hover:border-border-strong hover:bg-secondary hover:text-foreground motion-reduce:transition-none"
                    >
                      <Plus className="size-5" />
                    </button>
                  )
                )
              )}
              {placed.map((t) => {
                const isSel = d?.id === t.id;
                const v = isSel && d ? d : toDraft(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => select(t)}
                    aria-pressed={isSel}
                    style={{
                      gridColumn: `${t.col! + 1} / span ${t.widthCells}`,
                      gridRow: `${t.row! + 1} / span ${t.heightCells}`,
                    }}
                    className={cn(
                      posPressable,
                      "flex min-h-14 items-center justify-center border-2 text-body font-semibold tabular-nums",
                      t.shape === "round" ? "rounded-full" : "rounded-control",
                      isSel ? "border-foreground bg-foreground text-background shadow-md" : "border-border-strong bg-info-soft text-info-soft-foreground hover:shadow-sm"
                    )}
                  >
                    {isSel ? v.number || t.number : t.number}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alternativa para celular: lista de mesas con coordenadas. */}
          <div className="flex flex-col gap-2 md:hidden">
            <div className="flex items-center justify-between">
              <h2 className="text-body font-semibold text-foreground">Mesas ({tables.length})</h2>
              <Button onClick={addFirstFree} disabled={pending} className="min-h-11">
                <Plus /> Nueva mesa
              </Button>
            </div>
            {tables.length === 0 && (
              <p className="rounded-card border border-dashed border-border bg-card p-4 text-center text-body-sm text-muted-foreground">Aún no hay mesas en esta zona. Toca “Nueva mesa”.</p>
            )}
            <ul className="flex flex-col gap-2">
              {tables.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => select(t)}
                    aria-pressed={d?.id === t.id}
                    className={cn(
                      posPressable,
                      "flex min-h-12 w-full items-center justify-between gap-3 rounded-card border-2 bg-card px-3 py-2 text-left",
                      d?.id === t.id ? "border-foreground" : "border-border"
                    )}
                  >
                    <span className="font-semibold">Mesa {t.number}</span>
                    <span className="text-meta text-muted-foreground">
                      {t.col === null || t.row === null
                        ? "Sin colocar"
                        : `Col ${t.col + 1}, fila ${t.row + 1} · ${t.widthCells}×${t.heightCells} · ${
                            t.shape === "round" ? "redonda" : "cuadrada"
                          }`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
