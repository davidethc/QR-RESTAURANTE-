"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications";

/** El link en texto, seleccionable, con un botón para copiarlo. */
export function CopyLinkField({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("No se pudo copiar. Mantén presionado el link para copiarlo.");
    }
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pl-3 pr-1">
      <span
        className="min-w-0 flex-1 truncate text-meta text-foreground select-all"
        title={url}
      >
        {url}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={handleCopy}
        aria-label={`Copiar ${label}`}
        className="h-8 shrink-0"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
