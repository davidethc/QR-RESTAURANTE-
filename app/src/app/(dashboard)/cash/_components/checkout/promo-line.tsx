import { Tag } from "lucide-react";
import { toneSoft } from "@/components/shared/pos-tone";
import { cn, formatPrice } from "@/lib/utils";

/**
 * Promotion label as a chip ("-10%", "2x1"): icon + text, never color alone.
 * Shared by Caja, the table order screen and Carta.
 */
export function PromoChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold tabular-nums",
        toneSoft.attention,
        className
      )}
    >
      <Tag className="size-3.5" aria-hidden />
      <span className="sr-only">Promoción </span>
      {label}
    </span>
  );
}

/** List price struck through, then the net amount the customer pays. */
export function PromoPrice({
  list,
  net,
  className,
  netClassName,
}: {
  list: number;
  net: number;
  className?: string;
  netClassName?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline justify-end gap-x-1.5 tabular-nums", className)}>
      <s className="text-caption font-medium text-muted-foreground decoration-1">
        <span className="sr-only">Antes </span>
        {formatPrice(list)}
      </s>
      <span className={cn("font-semibold text-foreground", netClassName)}>
        <span className="sr-only">Ahora </span>
        {formatPrice(net)}
      </span>
    </span>
  );
}
