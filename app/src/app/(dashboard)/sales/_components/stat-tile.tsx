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
    <div className="flex flex-col gap-1.5 p-5">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}
