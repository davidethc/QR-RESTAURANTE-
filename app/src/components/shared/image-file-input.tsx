"use client";

import { useState } from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selector de imagen con textos en español. El <input type="file"> nativo
 * muestra "Choose File / No file chosen" según el idioma del navegador;
 * aquí queda oculto (sigue en el DOM y recibe el ref, así que quien lee
 * `ref.current.files` al enviar no cambia) y un <label> hace de botón.
 */
export function ImageFileInput({
  id,
  ref,
  accept = "image/jpeg,image/png,image/webp",
  className,
  "aria-describedby": describedBy,
}: {
  id: string;
  ref?: React.Ref<HTMLInputElement>;
  accept?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <input
        id={id}
        ref={ref}
        type="file"
        accept={accept}
        aria-describedby={describedBy}
        className="peer sr-only"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      <label
        htmlFor={id}
        className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-button border border-border-strong bg-card px-4 text-body-sm font-medium text-foreground transition-colors duration-150 hover:bg-secondary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
      >
        <ImageUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Elegir foto
      </label>
      <span className="truncate text-meta text-muted-foreground">
        {fileName ?? "Ninguna foto elegida"}
      </span>
    </div>
  );
}
