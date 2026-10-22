"use client";

import { useRef, useState, type ComponentProps, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { createModifierGroup, updateModifierGroup } from "@/lib/actions/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { modifierDraft, validateModifier, type ModifierDraft, type ModifierGroup } from "./modifier-model";
import { ModifierPreview } from "./modifier-preview";

function EditorField({ label, help, error, id, ...props }: ComponentProps<typeof Input> & { label: string; help?: string; error?: string; id: string }) {
  return <Field data-invalid={!!error}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input {...props} id={id} className="min-h-11" aria-invalid={!!error} aria-describedby={[help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined} />{help && <FieldDescription id={`${id}-help`}>{help}</FieldDescription>}<FieldError id={`${id}-error`}>{error}</FieldError></Field>;
}

export function ModifierEditor({ restaurantId, group, duplicate = false, onClose, onSaved }: {
  restaurantId: string; group?: ModifierGroup; duplicate?: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [initial] = useState(() => modifierDraft(group, duplicate));
  const [draft, setDraft] = useState<ModifierDraft>(initial);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [discard, setDiscard] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const saving = useRef(false);
  const errors = attempted ? validateModifier(draft).errors : {};
  const editing = !!group && !duplicate;
  const title = duplicate ? "Duplicar personalización" : editing ? "Editar personalización" : "Nueva personalización";

  function close() {
    if (saving.current) return;
    if (JSON.stringify(draft) !== JSON.stringify(initial)) setDiscard(true);
    else onClose();
  }

  function update<K extends keyof ModifierDraft>(key: K, value: ModifierDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSaveError("");
  }

  function move(index: number, direction: number) {
    const options = [...draft.options];
    [options[index], options[index + direction]] = [options[index + direction], options[index]];
    update("options", options);
    requestAnimationFrame(() => document.getElementById(`option-${options[index + direction].key}-name`)?.focus());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    setAttempted(true);
    setSaveError("");
    const checked = validateModifier(draft);
    if (!checked.parsed.success || Object.keys(checked.errors).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const result = editing ? await updateModifierGroup(group.id, checked.parsed.data) : await createModifierGroup(restaurantId, checked.parsed.data);
      if (result.ok) onSaved();
      else setSaveError(result.error);
    } catch {
      setSaveError("No pudimos confirmar el guardado. Conservamos tus cambios; revisa tu conexión y reintenta.");
    } finally { saving.current = false; setBusy(false); }
  }

  return <>
    <Sheet open onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl" onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById("modifier-name")?.focus(); }} onCloseAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader className="relative border-b p-4 pr-16 md:p-6 md:pr-16"><SheetTitle className="text-title">{title}</SheetTitle><SheetDescription>Configura las opciones que podrán elegir tus clientes.</SheetDescription><Button variant="ghost" size="icon" className="absolute top-3 right-3 size-11" aria-label="Cerrar personalización" disabled={busy} onClick={close}><X aria-hidden /></Button></SheetHeader>
        <form ref={form} noValidate onSubmit={save} className="flex min-h-0 flex-1 flex-col" aria-busy={busy}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <fieldset disabled={busy} className="min-w-0 space-y-6">
                <legend className="sr-only">Configuración de la personalización</legend>
                <section className="space-y-4" aria-label="Instrucción y referencia">
                  <EditorField id="modifier-name" label="Nombre del grupo" help="Instrucciones para el cliente." required value={draft.name} onChange={(event) => update("name", event.target.value)} error={errors.name} />
                  <EditorField id="modifier-label" label="Etiqueta interna (opcional)" help="No es visible para tus clientes." value={draft.internal_label} onChange={(event) => update("internal_label", event.target.value)} error={errors.internal_label} />
                  {editing && group.usage_count > 0 && <p className="rounded-control border border-warning-border bg-warning-soft p-3 text-body-sm text-foreground">Este grupo se usa en {group.usage_count} productos. Los cambios se aplicarán a todos.</p>}
                </section>
                <section aria-labelledby="modifier-options-title" className="space-y-4 border-t pt-6">
                  <div><h3 id="modifier-options-title" className="text-title-sm font-semibold">Opciones</h3><p className="mt-1 text-body-sm text-muted-foreground">Usa Subir y Bajar para cambiar el orden.</p></div>
                  <FieldError>{errors.options}</FieldError>
                  {draft.options.map((option, index) => <div key={option.key} className="space-y-3 rounded-card border bg-card p-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                      <EditorField id={`option-${option.key}-name`} label={`Nombre de opción ${index + 1}`} required value={option.name} error={errors[`options.${index}.name`]} onChange={(event) => update("options", draft.options.map((row) => row.key === option.key ? { ...row, name: event.target.value } : row))} />
                      <EditorField id={`option-${option.key}-price`} label="Precio extra ($)" inputMode="decimal" required value={option.price} error={errors[`options.${index}.price`]} onChange={(event) => update("options", draft.options.map((row) => row.key === option.key ? { ...row, price: event.target.value } : row))} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="min-h-11" disabled={index === 0} aria-label={`Subir ${option.name || `opción ${index + 1}`}`} onClick={() => move(index, -1)}><ArrowUp aria-hidden />Subir</Button>
                      <Button type="button" variant="outline" className="min-h-11" disabled={index === draft.options.length - 1} aria-label={`Bajar ${option.name || `opción ${index + 1}`}`} onClick={() => move(index, 1)}><ArrowDown aria-hidden />Bajar</Button>
                      <Button type="button" variant="ghost" size="icon" className="ml-auto size-11 text-destructive" aria-label={`Borrar ${option.name || `opción ${index + 1}`}`} disabled={draft.options.length === 1} onClick={() => { update("options", draft.options.filter((row) => row.key !== option.key)); requestAnimationFrame(() => document.getElementById("add-modifier-option")?.focus()); }}><Trash2 aria-hidden /></Button>
                    </div>
                  </div>)}
                  <Button id="add-modifier-option" type="button" variant="outline" className="min-h-11" onClick={() => { const key = crypto.randomUUID(); update("options", [...draft.options, { key, name: "", price: "0.00" }]); requestAnimationFrame(() => document.getElementById(`option-${key}-name`)?.focus()); }}><Plus aria-hidden />Agregar otra opción</Button>
                </section>
                <section aria-labelledby="modifier-limits-title" className="space-y-4 border-t pt-6">
                  <h3 id="modifier-limits-title" className="text-title-sm font-semibold">Cantidad a seleccionar</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <EditorField id="modifier-min" label="Mínimo" help="0 significa opcional." inputMode="numeric" type="number" min={0} step={1} required value={draft.min_select} error={errors.min_select} onChange={(event) => update("min_select", event.target.value)} />
                    <EditorField id="modifier-max" label="Máximo" inputMode="numeric" type="number" min={1} step={1} required value={draft.max_select} error={errors.max_select} onChange={(event) => update("max_select", event.target.value)} />
                  </div>
                  <FieldLabel htmlFor="modifier-repeat" className="min-h-11 w-full cursor-pointer justify-between gap-4 rounded-control border p-4"><span>Permitir repetición de opciones<span className="mt-1 block text-body-sm font-normal text-muted-foreground">Una misma opción puede elegirse más de una vez.</span></span><Switch id="modifier-repeat" checked={draft.allow_repeat} onCheckedChange={(value) => update("allow_repeat", value)} className="after:-inset-y-4" /></FieldLabel>
                  <p className="text-body-sm text-muted-foreground">Cada selección cuenta para el máximo.</p>
                </section>
              </fieldset>
              <ModifierPreview key={`${draft.min_select}-${draft.max_select}-${draft.allow_repeat}-${draft.options.map((option) => option.key).join()}`} draft={draft} />
            </div>
          </div>
          <div className="space-y-3 border-t bg-card p-4 shadow-sheet md:px-6">
            <FieldError>{saveError}</FieldError>
            <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={close}>Cancelar</Button><Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Agregar personalización"}</Button></div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle><AlertDialogDescription>Los cambios de este formulario no se guardarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11">Seguir editando</AlertDialogCancel><AlertDialogAction className="min-h-11" onClick={onClose}>Descartar cambios</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
