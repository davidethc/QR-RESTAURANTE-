import type { getModifierGroups } from "@/lib/actions/menu";
import { modifierGroupSchema } from "@/lib/validations/menu";

type GroupsResult = Awaited<ReturnType<typeof getModifierGroups>>;
export type ModifierGroup = Extract<GroupsResult, { ok: true }>["data"][number];
export type ModifierDraft = {
  name: string;
  internal_label: string;
  min_select: string;
  max_select: string;
  allow_repeat: boolean;
  options: { key: string; id?: string; name: string; price: string }[];
};

export function modifierDraft(group?: ModifierGroup, duplicate = false): ModifierDraft {
  return {
    name: group ? `${group.name}${duplicate ? " (copia)" : ""}` : "",
    internal_label: group?.internal_label ?? "",
    min_select: String(group?.min_select ?? 0),
    max_select: String(group?.max_select ?? 1),
    allow_repeat: group?.allow_repeat ?? false,
    options: group ? [...group.modifier_options].sort((a, b) => a.position - b.position).map((option) => ({
      key: option.id, ...(duplicate ? {} : { id: option.id }), name: option.name, price: String(option.price),
    })) : [{ key: "initial", name: "", price: "0.00" }],
  };
}

export function validateModifier(draft: ModifierDraft) {
  const errors: Record<string, string> = {};
  const number = (value: string) => value.trim() === "" ? NaN : Number(value.replace(",", "."));
  const parsed = modifierGroupSchema.safeParse({
    ...draft,
    min_select: number(draft.min_select), max_select: number(draft.max_select),
    options: draft.options.map(({ id, name, price }) => ({ ...(id ? { id } : {}), name, price: number(price) })),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      errors[path] ??= issue.code === "invalid_type" ? "Escribe un número válido." : issue.message;
    }
  }
  if (!draft.name.trim()) errors.name = "Completa este campo.";
  for (const field of ["min_select", "max_select"] as const) {
    if (!draft[field].trim()) errors[field] = "Completa este campo.";
  }
  draft.options.forEach((option, index) => {
    if (!option.name.trim()) errors[`options.${index}.name`] = "Completa este campo.";
    if (!option.price.trim()) errors[`options.${index}.price`] = "Completa este campo.";
  });
  if (number(draft.max_select) < number(draft.min_select)) {
    errors.max_select = "El máximo debe ser igual o mayor que el mínimo.";
  }
  return { parsed, errors };
}

export function filterModifiers(groups: ModifierGroup[], search: string, unused: boolean) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const query = normalize(search.trim());
  return groups.filter((group) => (!unused || group.usage_count === 0)
    && normalize(`${group.name} ${group.internal_label ?? ""}`).includes(query));
}
