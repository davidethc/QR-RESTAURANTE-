"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecoverableError } from "@/components/shared/recoverable-error";

export function SecurityLoadError({ tooMany = false }: { tooMany?: boolean }) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  return <div className="[&_button]:min-h-11"><RecoverableError
    title={tooMany ? "Hay muchos eventos en estas fechas" : "No pudimos cargar el historial"}
    description={tooMany ? "Elige un rango de fechas más corto y vuelve a aplicar los filtros." : "Tus datos siguen seguros. Intenta cargar el historial de nuevo."}
    retrying={retrying}
    onRetry={() => startTransition(() => router.refresh())}
  /></div>;
}
