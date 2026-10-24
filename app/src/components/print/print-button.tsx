"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Imprimir" button for any print view. With `autoPrint` it opens the print
 * dialog once, after fonts finished loading (printing earlier paginates with
 * the fallback font and the columns come out at another width).
 */
export function PrintButton({ autoPrint = false, className }: { autoPrint?: boolean; className?: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!autoPrint || firedRef.current) return;
    firedRef.current = true;
    document.fonts.ready.then(() => window.print());
  }, [autoPrint]);

  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className={cn("clay clay-primary h-12 w-full rounded-full text-body font-semibold print:hidden", className)}
    >
      <Printer aria-hidden data-icon="inline-start" /> Imprimir
    </Button>
  );
}
