"use client";

import { Clock } from "lucide-react";
import { useSearchParams } from "next/navigation";

/** Por qué el panel mandó aquí (ver `(dashboard)/layout.tsx`). */
const NOTICES: Record<string, string> = {
  sesion: "Tu sesión terminó. Vuelve a iniciar sesión para seguir.",
  "sin-restaurante":
    "Tu cuenta no tiene un restaurante activo. Pide al dueño que te agregue o reactive en Personal.",
};

export function LoginNotice() {
  const motivo = useSearchParams().get("motivo");
  const notice = motivo ? NOTICES[motivo] : undefined;
  if (!notice) return null;

  return (
    <p
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-xl border border-attention-border bg-attention-soft px-4 py-3 text-body-sm font-medium text-attention-soft-foreground"
    >
      <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
      {notice}
    </p>
  );
}
