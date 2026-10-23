"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Filter, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { posPressable, toneSoft } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import { SECURITY_ACTIONS, securityHistoryHref, type SecurityAction, type SecurityFilters } from "@/lib/security-history";
import { securityEventStyle } from "./security-event-style";

type Period = "today" | "7d" | "30d" | "custom";

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodRange(period: Exclude<Period, "custom">, today: string) {
  if (period === "today") return { from: today, to: today };
  return { from: shiftDay(today, period === "7d" ? -6 : -29), to: today };
}

function currentPeriod(filters: SecurityFilters, today: string): Period {
  if (filters.to !== today) return "custom";
  if (filters.from === today) return "today";
  if (filters.from === shiftDay(today, -6)) return "7d";
  if (filters.from === shiftDay(today, -29)) return "30d";
  return "custom";
}

/**
 * Filtros del historial: periodo y tipo se eligen con un toque (control
 * segmentado y fichas con icono, como Caja) y aplican al momento; las
 * fechas exactas siguen esperando "Aplicar" para no recargar por tecla.
 */
export function SecurityFiltersForm({ filters, members, today }: {
  filters: SecurityFilters;
  members: { id: string; name: string }[];
  /** Fecha de hoy en la zona del historial (YYYY-MM-DD). */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(filters);
  const [period, setPeriod] = useState<Period>(() => currentPeriod(filters, today));

  function go(next: SecurityFilters) {
    setDraft(next);
    startTransition(() => router.push(securityHistoryHref(next, 1)));
  }

  function pickPeriod(next: Period) {
    setPeriod(next);
    if (next !== "custom") go({ ...draft, ...periodRange(next, today) });
  }

  const actions: (SecurityAction | "")[] = ["", ...(Object.keys(SECURITY_ACTIONS) as SecurityAction[])];

  return (
    <section aria-label="Filtrar historial" aria-busy={pending} className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Filter className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-body font-semibold text-foreground">Filtros</h2>
        {pending && (
          <span role="status" className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Actualizando…
          </span>
        )}
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex w-20 shrink-0 items-center gap-1.5 text-meta font-medium text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden /> Periodo
          </span>
          <SegmentedControl<Period>
            aria-label="Periodo"
            value={period}
            onValueChange={pickPeriod}
            disabled={pending}
            options={[
              { value: "today", label: "Hoy" },
              { value: "7d", label: "7 días" },
              { value: "30d", label: "30 días" },
              { value: "custom", label: "Fechas" },
            ]}
          />
        </div>

        {period === "custom" && (
          <form
            aria-label="Rango de fechas"
            onSubmit={(event) => {
              event.preventDefault();
              go(draft);
            }}
            className="grid grid-cols-2 items-end gap-3 rounded-control border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="security-from">Desde</Label>
              <Input id="security-from" name="from" type="date" required value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className="h-11 w-full min-w-0 bg-card" />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="security-to">Hasta</Label>
              <Input id="security-to" name="to" type="date" required value={draft.to} min={draft.from} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className="h-11 w-full min-w-0 bg-card" />
            </div>
            <Button type="submit" disabled={pending} className="col-span-2 min-h-11 sm:col-span-1">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Aplicar fechas
            </Button>
          </form>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <span className="flex w-20 shrink-0 items-center gap-1.5 pt-2.5 text-meta font-medium text-muted-foreground">
            <Filter className="size-4" aria-hidden /> Tipo
          </span>
          <div role="group" aria-label="Tipo de acción" className="flex min-w-0 flex-wrap gap-2">
            {actions.map((value) => {
              const active = draft.action === value;
              const style = value ? securityEventStyle(value) : null;
              const Icon = style?.icon;
              return (
                <button
                  key={value || "all"}
                  type="button"
                  aria-pressed={active}
                  disabled={pending}
                  onClick={() => !active && go({ ...draft, action: value })}
                  className={cn(
                    posPressable,
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-body-sm font-medium",
                    active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-border-strong"
                  )}
                >
                  {Icon && style && (
                    <span className={cn("flex size-6 items-center justify-center rounded-full border", active ? "border-transparent bg-background/15 text-background" : toneSoft[style.tone])}>
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                  )}
                  {value ? SECURITY_ACTIONS[value] : "Todas"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="security-member" className="flex w-20 shrink-0 items-center gap-1.5 text-meta font-medium text-muted-foreground">
            <Users className="size-4" aria-hidden /> Miembro
          </Label>
          <Select value={draft.member || "all"} onValueChange={(value) => go({ ...draft, member: value === "all" ? "" : value })} disabled={pending}>
            <SelectTrigger id="security-member" className="min-h-11 w-full min-w-0 sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all" className="min-h-11">Todo el equipo</SelectItem>
              {draft.member && !members.some((member) => member.id === draft.member) && <SelectItem value={draft.member} className="min-h-11">Miembro no disponible</SelectItem>}
              {members.map((member) => <SelectItem key={member.id} value={member.id} className="min-h-11">{member.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
