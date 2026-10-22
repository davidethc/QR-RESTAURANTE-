import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const session = await getMyRestaurant();
  if (!isManager(session.role)) redirect(session.role === "KITCHEN" ? "/kitchen" : "/tables");
  const defaults = defaultSecurityFilters();
  let filters;
  try { filters = parseSecurityFilters(await searchParams, defaults); }
  catch {
    return <main><PageHeader title="Historial de seguridad" /><div className="px-4 md:px-8"><p role="alert" className="text-body-sm text-foreground">Revisa las fechas y los filtros del historial.</p><Button asChild variant="outline" className="mt-4 min-h-11"><Link href="/security">Restablecer filtros</Link></Button></div></main>;
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
  return <main className="pb-10">
    <PageHeader title="Historial de seguridad" description="Revisa las acciones sensibles de tu equipo, en un solo lugar." />
    <div className="flex flex-col gap-5 px-4 md:px-8">
      <SecurityFiltersForm key={securityHistoryHref(filters)} filters={filters} members={result?.members ?? []} />
      <p className="text-caption text-muted-foreground">Fechas y horas de Ecuador. Los eventos de una misma cuenta se muestran juntos.</p>
      {!result ? <SecurityLoadError tooMany={tooMany} /> : <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-body font-semibold text-foreground">Actividad del equipo</h2>
          <p className="text-meta text-muted-foreground">{result.total} {result.total === 1 ? "grupo de eventos" : "grupos de eventos"}</p>
        </div>
        <SecurityList groups={result.groups} members={result.members} filtered={!!filters.action || !!filters.member || filters.from !== defaults.from || filters.to !== defaults.to} />
        {result.total > 0 && <nav aria-label="Páginas del historial" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button asChild={result.page > 1} disabled={result.page <= 1} variant="outline" className="min-h-11">
            {result.page > 1 ? <Link href={securityHistoryHref(filters, result.page - 1)}><ChevronLeft aria-hidden /> Anterior</Link> : <span className="flex items-center gap-1"><ChevronLeft aria-hidden /> Anterior</span>}
          </Button>
          <p className="text-meta text-muted-foreground">Página {result.page} de {result.pages}</p>
          <Button asChild={result.page < result.pages} disabled={result.page >= result.pages} variant="outline" className="min-h-11">
            {result.page < result.pages ? <Link href={securityHistoryHref(filters, result.page + 1)}>Siguiente <ChevronRight aria-hidden /></Link> : <span className="flex items-center gap-1">Siguiente <ChevronRight aria-hidden /></span>}
          </Button>
        </nav>}
      </>}
    </div>
  </main>;
}
