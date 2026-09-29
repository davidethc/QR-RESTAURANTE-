"use client";

import { CopyLinkField } from "@/components/shared/copy-link-field";

/** Datos de acceso para dictarle o enviarle a la persona. */
export function CredentialsCard({ email, password }: { email: string; password: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-border bg-muted p-3.5">
      <p className="text-meta text-muted-foreground">
        Pásale estos datos. Solo se muestran ahora; si se pierden, genera una
        clave nueva.
      </p>
      <CopyLinkField url={email} label="correo" />
      <CopyLinkField url={password} label="clave" />
    </div>
  );
}
