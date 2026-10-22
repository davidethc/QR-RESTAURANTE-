import type {
  StaffModifierGroup,
  StaffProductDetail,
  StaffVariant,
} from "@/types/menu";

/**
 * "Separar uno": una línea de cantidad N pasa a N líneas de cantidad 1.
 * Sirve para dar a cada comensal su propia línea (distinta nota o variante)
 * sin perder unidades: la suma de cantidades antes y después es idéntica.
 * La primera conserva el `id` original; las demás reciben uno nuevo.
 */
export function splitLineIntoUnits<T extends { id: string; quantity: number }>(
  line: T,
  newId: () => string
): T[] {
  const total = Math.max(1, Math.floor(line.quantity));
  return Array.from({ length: total }, (_, i) => ({
    ...line,
    id: i === 0 ? line.id : newId(),
    quantity: 1,
  }));
}

/** Aplica `splitLineIntoUnits` a la línea `id` dentro de la lista, en su sitio. */
export function splitLineInList<T extends { id: string; quantity: number }>(
  lines: T[],
  id: string,
  newId: () => string
): T[] {
  return lines.flatMap((line) =>
    line.id === id ? splitLineIntoUnits(line, newId) : [line]
  );
}

export function totalQuantity(lines: { quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** "Desde $X": la variante más barata si hay varias, si no el precio del producto. */
export function fromPrice(
  basePrice: number,
  variants: StaffVariant[] | undefined
): { price: number; hasChoice: boolean } {
  if (!variants || variants.length <= 1) {
    return { price: variants?.[0]?.price ?? basePrice, hasChoice: false };
  }
  return { price: Math.min(...variants.map((v) => v.price)), hasChoice: true };
}

/** Con más de una variante el mesero debe elegir; con una sola se usa sola. */
export function variantRequired(detail: StaffProductDetail | undefined): boolean {
  return (detail?.variants.length ?? 0) > 1;
}

/** Cuántas elecciones lleva el grupo (suma de repeticiones). */
export function selectedCount(selection: Record<string, number>): number {
  return Object.values(selection).reduce((a, b) => a + b, 0);
}

/** Mensaje de error de un grupo según min/max, o null si cumple. */
export function groupError(
  group: StaffModifierGroup,
  selection: Record<string, number>
): string | null {
  const n = selectedCount(selection);
  if (n < group.min_select) {
    return group.min_select === 1
      ? `Elige una opción de ${group.name}.`
      : `Elige al menos ${group.min_select} opciones de ${group.name}.`;
  }
  if (n > group.max_select) {
    return `Máximo ${group.max_select} opciones en ${group.name}.`;
  }
  return null;
}

/** Cambia en +1/-1 una opción respetando max_select y allow_repeat. */
export function bumpOption(
  group: StaffModifierGroup,
  selection: Record<string, number>,
  optionId: string,
  delta: 1 | -1
): Record<string, number> {
  const current = selection[optionId] ?? 0;
  const next = current + delta;
  if (next < 0) return selection;
  if (delta === 1) {
    if (selectedCount(selection) >= group.max_select) return selection;
    if (!group.allow_repeat && current >= 1) return selection;
  }
  const copy = { ...selection };
  if (next === 0) delete copy[optionId];
  else copy[optionId] = next;
  return copy;
}

/** Texto de las personalizaciones elegidas: "Extra queso x2, Sin sal". */
export function modifiersSummary(
  groups: StaffModifierGroup[],
  selections: Record<string, Record<string, number>>
): string {
  return groups
    .flatMap((g) =>
      g.options
        .filter((o) => (selections[g.id]?.[o.id] ?? 0) > 0)
        .map((o) => {
          const n = selections[g.id][o.id];
          return n > 1 ? `${o.name} x${n}` : o.name;
        })
    )
    .join(", ");
}

/** Opciones elegidas en el formato que espera la base: [{optionId, qty}]. */
export function modifierPicks(
  groups: StaffModifierGroup[],
  selections: Record<string, Record<string, number>>
): { optionId: string; qty: number }[] {
  return groups.flatMap((g) =>
    g.options
      .filter((o) => (selections[g.id]?.[o.id] ?? 0) > 0)
      .map((o) => ({ optionId: o.id, qty: selections[g.id][o.id] }))
  );
}

/** Suma informativa de las opciones (precio x veces); el cobro lo calcula la base. */
export function modifiersPrice(
  groups: StaffModifierGroup[],
  selections: Record<string, Record<string, number>>
): number {
  return groups.reduce(
    (sum, g) =>
      sum +
      g.options.reduce((s, o) => s + o.price * (selections[g.id]?.[o.id] ?? 0), 0),
    0
  );
}

/** El producto exige elegir algo (variante o grupo obligatorio) antes de pedirse. */
export function needsChoice(detail: StaffProductDetail | undefined): boolean {
  return (
    variantRequired(detail) || (detail?.groups.some((g) => g.min_select > 0) ?? false)
  );
}
