export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-display font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}
