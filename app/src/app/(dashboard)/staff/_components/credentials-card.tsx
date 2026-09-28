"use client";

import { CopyLinkField } from "@/components/shared/copy-link-field";

/** Datos de acceso para dictarle o enviarle a la persona. */
export function CredentialsCard({ email, password }: { email: string; password: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[13px] text-muted-foreground">
        Pásale estos datos. Solo se muestran ahora; si se pierden, genera una
        clave nueva.
      </p>
      <CopyLinkField url={email} label="correo" />
      <CopyLinkField url={password} label="clave" />
    </div>
  );
}
