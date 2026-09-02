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
    <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
