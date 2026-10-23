"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Plus, SlidersHorizontal } from "lucide-react";
import { getModifierGroups, getModifierGroupUsage, deleteModifierGroup } from "@/lib/actions/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { RecoverableError } from "@/components/shared/recoverable-error";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ModifierEditor } from "./modifier-editor";
import { filterModifiers, type ModifierGroup } from "./modifier-model";

export function ModifierBoard({ restaurantId }: { restaurantId: string }) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<{ group?: ModifierGroup; duplicate?: boolean } | null>(null);
  const [deleting, setDeleting] = useState<ModifierGroup | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [message, setMessage] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const request = useRef(0);

  async function load() {
    const version = ++request.current;
    try {
      const result = await getModifierGroups(restaurantId);
      if (request.current !== version) return;
      if (result.ok) setGroups(result.data);
      else setError(result.error);
    } catch {
      if (request.current === version) setError("No pudimos cargar las personalizaciones. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      if (request.current === version) setLoading(false);
    }
  }

  function reload() {
    setLoading(true);
    setError("");
    return load();
  }

  useEffect(() => {
    let active = true;
    getModifierGroups(restaurantId).then((result) => {
      if (!active) return;
      if (result.ok) setGroups(result.data);
      else setError(result.error);
    }).catch(() => {
      if (active) setError("No pudimos cargar las personalizaciones. Revisa tu conexión e inténtalo de nuevo.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [restaurantId]);

  function restoreFocus() {
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : newButton.current)?.focus());
  }

  function openEditor(group?: ModifierGroup, duplicate = false) {
    setMessage("");
    setEditor({ group, duplicate });
  }

  async function readUsage(group: ModifierGroup) {
    setDeleteBusy(true);
    setUsage(null);
    setDeleteError("");
    try {
      const result = await getModifierGroupUsage(group.id);
      if (result.ok) setUsage(result.data);
      else setDeleteError(result.error);
    } catch {
      setDeleteError("No pudimos consultar cuántos productos usan esta personalización.");
    } finally { setDeleteBusy(false); }
  }

  async function remove() {
    if (!deleting || usage === null || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const result = await deleteModifierGroup(deleting.id, usage);
      if (!result.ok) {
        setDeleteError(result.error);
        // Una confirmación anterior nunca autoriza un nuevo conteo de uso.
        setUsage(null);
        return;
      }
      setDeleting(null);
      setMessage("Personalización eliminada.");
      void reload();
    } catch {
      setDeleteError("No se pudo confirmar el borrado. Consulta el uso y reintenta.");
      setUsage(null);
    } finally { setDeleteBusy(false); }
  }

  const visible = filterModifiers(groups, search, filter === "unused");
  const unusedCount = groups.filter((group) => group.usage_count === 0).length;
  const newAction = <Button ref={newButton} className="min-h-11" onClick={(event) => { trigger.current = event.currentTarget; openEditor(); }}><Plus aria-hidden /> Nueva personalización</Button>;

  return (
    <section aria-label="Personalizaciones" className="space-y-6 pb-12 [&_button]:min-h-11">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-display text-title font-semibold">Personalizaciones</h2><p className="mt-1 text-body-sm text-muted-foreground">Crea grupos que puedes reutilizar en varios productos.</p></div>
        {newAction}
      </div>
      <p role="status" className="text-body-sm text-primary empty:hidden">{message}</p>
      <div className="space-y-4 rounded-card border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SegmentedControl aria-label="Filtrar personalizaciones" value={filter} onValueChange={setFilter} options={[{ value: "all", label: "Todas" }, { value: "unused", label: loading || error ? "Sin usar" : `Sin usar (${unusedCount})` }]} />
          <Field className="sm:max-w-sm"><FieldLabel htmlFor="modifier-search">Buscar personalización</FieldLabel><Input id="modifier-search" type="search" className="min-h-11" placeholder="Nombre o etiqueta interna" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
        </div>
        {loading ? <div role="status" aria-busy="true" className="space-y-4 py-6"><span className="sr-only">Cargando personalizaciones…</span>{[0, 1, 2].map((key) => <Skeleton key={key} className="h-16 w-full" />)}</div>
          : error ? <RecoverableError title="No pudimos cargar las personalizaciones" description={error} onRetry={() => void reload()} />
          : groups.length === 0 ? <EmptyState icon={SlidersHorizontal} title="No se han creado personalizaciones." description="Crea personalizaciones para tus productos. Permite a tus clientes agregar extras, quitar ingredientes o escoger formas de preparación." />
          : visible.length === 0 ? <EmptyState icon={SlidersHorizontal} title={!search.trim() && filter === "unused" ? "No hay personalizaciones sin usar." : "No hay coincidencias."} description={!search.trim() && filter === "unused" ? "Todos los grupos están vinculados a productos." : "Prueba con otro nombre o cambia el filtro."} action={<Button variant="outline" className="min-h-11" onClick={() => { setSearch(""); setFilter("all"); }}>Ver todas</Button>} />
          : <Table className="table-fixed">
            <TableHeader><TableRow><TableHead className="whitespace-normal">Nombre del grupo</TableHead><TableHead className="hidden w-1/3 sm:table-cell">Etiqueta interna</TableHead><TableHead className="w-14"><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>{visible.map((group) => <TableRow key={group.id}>
              <TableCell className="space-y-2 whitespace-normal py-4 wrap-anywhere"><p className="font-medium">{group.name}</p><p className="text-muted-foreground sm:hidden">{group.internal_label || "Sin etiqueta interna"}</p><Badge variant="secondary">{group.usage_count ? `En ${group.usage_count} productos` : "Sin usar"}</Badge></TableCell>
              <TableCell className="hidden whitespace-normal text-muted-foreground wrap-anywhere sm:table-cell">{group.internal_label || "Sin etiqueta interna"}</TableCell>
              <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label={`Acciones de ${group.name}`} onPointerDown={(event) => { trigger.current = event.currentTarget; }} onKeyDown={(event) => { trigger.current = event.currentTarget; }}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="[&_[role=menuitem]]:min-h-11" onCloseAutoFocus={(event) => { if (editor || deleting) event.preventDefault(); }}>
                <DropdownMenuItem onSelect={() => openEditor(group)}>Editar</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openEditor(group, true)}>Duplicar</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => { setDeleting(group); void readUsage(group); }}>Borrar</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>)}</TableBody>
          </Table>}
        {!loading && !error && groups.length > 0 && <p className="text-meta text-muted-foreground">Mostrando {visible.length} personalizaciones</p>}
      </div>
      {editor && <ModifierEditor restaurantId={restaurantId} group={editor.group} duplicate={editor.duplicate} onClose={() => { setEditor(null); restoreFocus(); }} onSaved={() => { setEditor(null); setMessage("Personalización guardada."); restoreFocus(); void reload(); }} />}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open && !deleteBusy) setDeleting(null); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
          <AlertDialogHeader><AlertDialogTitle>¿Borrar personalización?</AlertDialogTitle><AlertDialogDescription className="wrap-anywhere">“{deleting?.name}”. {usage === null ? "Consultaremos cuántos productos la usan antes de borrar." : `Se usa en ${usage} productos.${usage ? " Dejará de estar disponible en todos ellos." : ""}`} Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          {deleteBusy && <p role="status" className="text-body-sm text-muted-foreground">Procesando…</p>}
          <FieldError>{deleteError}</FieldError>
          <AlertDialogFooter><Button variant="outline" className="min-h-11" disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancelar</Button>{usage === null ? <Button className="min-h-11" disabled={deleteBusy} onClick={() => deleting && void readUsage(deleting)}>Consultar uso</Button> : <Button variant="destructive" className="min-h-11" disabled={deleteBusy} onClick={() => void remove()}>Borrar personalización</Button>}</AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
