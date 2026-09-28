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
    <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-6 pt-8 md:px-8">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground text-balance">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-body-sm leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
