/**
 * Encabezado consistente para cada pantalla del panel (mesero, cocina,
 * administración). Título + descripción opcional + un slot para la
 * acción principal de la pantalla (ej. "+ Nuevo producto").
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 px-4 pb-3 pt-5 sm:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
