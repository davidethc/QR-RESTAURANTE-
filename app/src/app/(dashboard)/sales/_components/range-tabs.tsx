import Link from "next/link";
import { cn } from "@/lib/utils";

export type SalesRange = "hoy" | "7d" | "30d";

const RANGES: { value: SalesRange; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
];

export function RangeTabs({ active }: { active: SalesRange }) {
  return (
    <nav
      aria-label="Periodo"
      className="flex w-fit gap-1 rounded-control border border-border bg-secondary p-1"
    >
      {RANGES.map((r) => (
        <Link
          key={r.value}
          href={r.value === "hoy" ? "/sales" : `/sales?range=${r.value}`}
          aria-current={r.value === active ? "page" : undefined}
          className={cn(
            "flex h-8 items-center rounded-control px-3 text-meta font-medium transition-colors duration-150",
            r.value === active
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
