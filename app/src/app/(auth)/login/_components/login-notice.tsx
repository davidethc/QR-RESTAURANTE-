"use client";

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
      className="mb-6 rounded-card bg-warning-soft px-4 py-3 text-center text-meta text-warning-soft-foreground"
    >
      {notice}
    </p>
  );
}
