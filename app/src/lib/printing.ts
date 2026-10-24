import type { PrintFontSize, PrintingDraft, PrintingSettings } from "@/types/printing";

export const PRINT_TEXT_MAX = 200;

export const FONT_SIZE_OPTIONS: { value: PrintFontSize; label: string }[] = [
  { value: "small", label: "Chica" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grande" },
];

/** Base font size in px for the customer ticket (80mm paper, monospace). */
const CUSTOMER_PX: Record<PrintFontSize, number> = { small: 10, normal: 12, large: 14 };
/** Base font size in px for the kitchen ticket: bigger, read at arm's length. */
const KITCHEN_PX: Record<PrintFontSize, number> = { small: 16, normal: 20, large: 24 };

export function customerFontPx(size: PrintFontSize): number {
  return CUSTOMER_PX[size] ?? CUSTOMER_PX.normal;
}

export function kitchenFontPx(size: PrintFontSize): number {
  return KITCHEN_PX[size] ?? KITCHEN_PX.normal;
}

export function toDraft(settings: Pick<
  PrintingSettings,
  "customer_ticket_font_size" | "customer_ticket_header" | "customer_ticket_footer" | "kitchen_ticket_font_size"
>): PrintingDraft {
  return {
    customer_ticket_font_size: settings.customer_ticket_font_size,
    customer_ticket_header: settings.customer_ticket_header ?? "",
    customer_ticket_footer: settings.customer_ticket_footer ?? "",
    kitchen_ticket_font_size: settings.kitchen_ticket_font_size,
  };
}

/** Same comparison the server applies: trimmed text, empty = none. */
export function normalizeDraft(draft: PrintingDraft): PrintingDraft {
  return {
    ...draft,
    customer_ticket_header: draft.customer_ticket_header.trim(),
    customer_ticket_footer: draft.customer_ticket_footer.trim(),
  };
}

export function isDraftDirty(saved: PrintingDraft, current: PrintingDraft): boolean {
  const a = normalizeDraft(saved);
  const b = normalizeDraft(current);
  return (
    a.customer_ticket_font_size !== b.customer_ticket_font_size ||
    a.customer_ticket_header !== b.customer_ticket_header ||
    a.customer_ticket_footer !== b.customer_ticket_footer ||
    a.kitchen_ticket_font_size !== b.kitchen_ticket_font_size
  );
}

/** Returns an error message per field, or null when the draft can be saved. */
export function validateDraft(draft: PrintingDraft): Partial<Record<keyof PrintingDraft, string>> | null {
  const errors: Partial<Record<keyof PrintingDraft, string>> = {};
  if (draft.customer_ticket_header.trim().length > PRINT_TEXT_MAX) {
    errors.customer_ticket_header = `Máximo ${PRINT_TEXT_MAX} caracteres.`;
  }
  if (draft.customer_ticket_footer.trim().length > PRINT_TEXT_MAX) {
    errors.customer_ticket_footer = `Máximo ${PRINT_TEXT_MAX} caracteres.`;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** Splits free text into printable lines, dropping blank ones. */
export function textLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** "29 sep 2026, 3:02 p. m." in the restaurant's own timezone. */
export function formatTicketDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("es-EC", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
}

/** "14:05" in the restaurant's timezone, for the kitchen ticket. */
export function formatTicketTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("es-EC", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return "";
  }
}

export interface KitchenOptionLike {
  group: string | null;
  name: string | null;
  qty: number | null;
}

export interface GroupedOptions {
  group: string | null;
  values: string[];
}

/**
 * Groups kitchen modifiers by their group, keeping first-appearance order:
 * "PUNTO: Término medio", "EXTRAS: Queso extra · Tocino". Quantities > 1
 * become "2 × Queso".
 */
export function groupKitchenOptions(options: KitchenOptionLike[]): GroupedOptions[] {
  const groups: GroupedOptions[] = [];
  for (const o of options) {
    const label = o.name ?? o.group ?? "";
    if (!label) continue;
    const value = o.qty && o.qty > 1 ? `${o.qty} × ${label}` : label;
    const key = o.group ?? null;
    const found = groups.find((g) => g.group === key);
    if (found) found.values.push(value);
    else groups.push({ group: key, values: [value] });
  }
  return groups;
}

/** Fields bill_json adds per line in M13; absent on older payloads. */
export interface PromoLineFields {
  promo_discount?: number | null;
  list_subtotal?: number | null;
}

/** Promo discount of a line exactly as the bill returned it (0 when absent). */
export function linePromoDiscount(line: PromoLineFields): number {
  const value = line.promo_discount;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Whether to show the list price + promo line. Pure display decision: it never
 * derives money, it only reads what the bill returned.
 */
export function hasPromo(line: PromoLineFields): boolean {
  return linePromoDiscount(line) > 0 && typeof line.list_subtotal === "number";
}

/** Label for the ticket title: pre-account while the bill is still open. */
export function ticketTitle(status: string): "PRE-CUENTA" | "TICKET" {
  return status === "OPEN" ? "PRE-CUENTA" : "TICKET";
}
