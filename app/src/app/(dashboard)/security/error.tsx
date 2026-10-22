"use client";

import { PageHeader } from "@/components/shared/page-header";
import { RecoverableError } from "@/components/shared/recoverable-error";

export default function SecurityError({ retry }: { retry: () => void }) {
  return <main><PageHeader title="Historial de seguridad" /><div className="[&_button]:min-h-11"><RecoverableError title="No pudimos cargar el historial" description="Intenta de nuevo en un momento." onRetry={retry} /></div></main>;
}
