import { Badge } from "@/components/ui/badge";
import { cutResultLabel } from "@/lib/cash-cut";
import { cn } from "@/lib/utils";

/** Exacto / Faltante / Sobrante. El color nunca es la única señal: lleva texto. */
export function CashResultBadge({ result }: { result: string | null | undefined }) {
  const tone =
    result === "EXACT"
      ? "bg-success-soft text-success-soft-foreground"
      : result === "SHORT"
        ? "bg-destructive-soft text-destructive"
        : result === "OVER"
          ? "bg-warning-soft text-warning-soft-foreground"
          : "bg-secondary text-muted-foreground";
  return <Badge className={cn("text-meta", tone)}>{cutResultLabel(result)}</Badge>;
}
