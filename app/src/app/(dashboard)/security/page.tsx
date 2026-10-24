import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileStack, ListChecks, ShieldCheck } from "lucide-react";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getSecurityHistory } from "@/lib/queries/security";
import { isManager } from "@/lib/permissions";
import { defaultSecurityFilters, parseSecurityFilters, securityHistoryHref } from "@/lib/security-history";
import { SecurityFiltersForm } from "./_components/security-filters";
import { SecurityList } from "./_components/security-list";
import { SecurityLoadError } from "./_components/security-load-error";

export const instant = false;
export const metadata: Metadata = { title: "Historial de seguridad" };

const DAY = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });
function displayDay(iso: string) {
  return DAY.format(new Date(`${iso}T12:00:00Z`));
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect(session.role === "KITCHEN" ? "/kitchen" : "/tables");
  const defaults = defaultSecurityFilters();
  let filters;
  try { filters = parseSecurityFilters(await searchParams, defaults); }
  catch {
    return <main data-caja className="min-h-full bg-background"><PageHeader title="Historial de seguridad" /><div className="px-4 md:px-8"><p role="alert" className="text-body-sm text-foreground">Revisa las fechas y los filtros del historial.</p><Button asChild variant="outline" className="mt-4 min-h-11"><Link href="/security">Restablecer filtros</Link></Button></div></main>;
  }
  let result;
  let tooMany = false;
  try { result = await getSecurityHistory(filters); }
  catch (error) {
    tooMany = error instanceof Error && error.message === "SECURITY_RANGE_TOO_LARGE";
    // No exponer detalles de la base ni metadata de auditoría.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "LOAD_FAILED";
    console.error("[security.history]", code);
  }
  const filtered = !!filters.action || !!filters.member || filters.from !== defaults.from || filters.to !== defaults.to;
  const rangeLabel = filters.from === filters.to ? displayDay(filters.from) : `${displayDay(filters.from)} – ${displayDay(filters.to)}`;
  return <main data-caja className="min-h-full bg-background pb-10">
    <h1 className="sr-only">Historial de seguridad</h1>
    <section aria-label="Estado del historial" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5">
      <StatusPill tone={result && result.total > 0 ? "info" : "money-in"} icon={ShieldCheck} title="Historial de seguridad" detail={rangeLabel} />
      {result && <div className="flex flex-wrap items-stretch gap-2 sm:border-l sm:border-border sm:pl-4">
        <StatusMetric label={filtered ? "Con estos filtros" : "Grupos de eventos"} value={String(result.total)} tone={result.total > 0 ? "info" : "neutral"} icon={ListChecks} />
        {result.pages > 1 && <StatusMetric label="Página" value={`${result.page} de ${result.pages}`} icon={FileStack} />}
      </div>}
    </section>
    <div className="flex flex-col gap-4 px-4 pt-4 md:px-5">
      <SecurityFiltersForm key={securityHistoryHref(filters)} filters={filters} members={result?.members ?? []} today={defaults.to} />
      {!result ? <SecurityLoadError tooMany={tooMany} /> : <section aria-labelledby="security-activity" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="security-activity" className="text-body font-semibold text-foreground">Actividad del equipo</h2>
          <p className="text-caption text-muted-foreground">Hora de Ecuador. Los eventos de una misma cuenta van juntos.</p>
        </div>
        <SecurityList groups={result.groups} members={result.members} filtered={filtered} />
        {result.total > 0 && <nav aria-label="Páginas del historial" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-3">
          <Button asChild={result.page > 1} disabled={result.page <= 1} variant="outline" className="min-h-11">
            {result.page > 1 ? <Link href={securityHistoryHref(filters, result.page - 1)}><ChevronLeft aria-hidden /> Anterior</Link> : <span className="flex items-center gap-1"><ChevronLeft aria-hidden /> Anterior</span>}
          </Button>
          <p className="text-meta text-muted-foreground">Página {result.page} de {result.pages}</p>
          <Button asChild={result.page < result.pages} disabled={result.page >= result.pages} variant="outline" className="min-h-11">
            {result.page < result.pages ? <Link href={securityHistoryHref(filters, result.page + 1)}>Siguiente <ChevronRight aria-hidden /></Link> : <span className="flex items-center gap-1">Siguiente <ChevronRight aria-hidden /></span>}
          </Button>
        </nav>}
      </section>}
    </div>
  </main>;
}
