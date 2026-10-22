"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SECURITY_ACTIONS, securityHistoryHref, type SecurityAction, type SecurityFilters } from "@/lib/security-history";

export function SecurityFiltersForm({ filters, members }: {
  filters: SecurityFilters;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(filters);
  return (
    <form aria-label="Filtrar historial" onSubmit={(event) => {
      event.preventDefault();
      startTransition(() => router.push(securityHistoryHref(draft, 1)));
    }} className="grid grid-cols-2 items-end gap-4 rounded-card border border-border bg-card p-4 lg:grid-cols-[1fr_1fr_1.25fr_1.25fr_auto]" aria-busy={pending}>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="security-from">Desde</Label>
        <Input id="security-from" name="from" type="date" required value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className="h-11 min-w-0 w-full" />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="security-to">Hasta</Label>
        <Input id="security-to" name="to" type="date" required value={draft.to} min={draft.from} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className="h-11 min-w-0 w-full" />
      </div>
      <div className="col-span-2 grid min-w-0 gap-2 sm:col-span-1">
        <Label htmlFor="security-action">Acción</Label>
        <Select value={draft.action || "all"} onValueChange={(value) => setDraft({ ...draft, action: value === "all" ? "" : value as SecurityAction })}>
          <SelectTrigger id="security-action" className="min-h-11 w-full min-w-0"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all" className="min-h-11">Todas las acciones</SelectItem>
            {Object.entries(SECURITY_ACTIONS).map(([value, label]) => <SelectItem key={value} value={value} className="min-h-11">{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 grid min-w-0 gap-2 sm:col-span-1">
        <Label htmlFor="security-member">Miembro</Label>
        <Select value={draft.member || "all"} onValueChange={(value) => setDraft({ ...draft, member: value === "all" ? "" : value })}>
          <SelectTrigger id="security-member" className="min-h-11 w-full min-w-0"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all" className="min-h-11">Todo el equipo</SelectItem>
            {draft.member && !members.some((member) => member.id === draft.member) && <SelectItem value={draft.member} className="min-h-11">Miembro no disponible</SelectItem>}
            {members.map((member) => <SelectItem key={member.id} value={member.id} className="min-h-11">{member.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending} className="col-span-2 min-h-11 sm:col-span-1">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <SlidersHorizontal aria-hidden />} Aplicar filtros
      </Button>
      {pending && <p role="status" className="col-span-full text-meta text-muted-foreground">Actualizando el historial…</p>}
    </form>
  );
}
