import { z } from "zod";
import type {
  ActivePromotion,
  Promotion,
  PromotionDisplayStatus,
  PromotionRule,
  PromoLineFields,
  PromotionChannel,
} from "@/types/promotions";

/**
 * M13 promotions on the client: labels, list status, form validation and the
 * display-only estimate of a line's discount. The server (build_order_lines /
 * promo_line_discount) prices every order; these mirrors only decide what the
 * screen shows before the order exists.
 */

/** Postgres `round(x, 2)` on positive amounts (half away from zero). */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Same text as `promotion_label`: "-10%", "-$1.50", "2x1". */
export function promotionLabel(rule: Pick<PromotionRule, "type" | "value_type" | "value" | "receive_qty" | "buy_qty">): string {
  if (rule.type === "buy_x_get_y") return `${rule.receive_qty}x${rule.buy_qty}`;
  const value = Number(rule.value ?? 0);
  if (rule.value_type === "percent") return `-${Number(value.toFixed(2))}%`;
  return `-$${value.toFixed(2)}`;
}

export const PROMOTION_TYPE_LABEL: Record<PromotionRule["type"], string> = {
  discount: "Descuento",
  buy_x_get_y: "Compra X lleva Y",
};

/** Monday-first order for the day picker; values are Postgres DOW (0 = Sunday). */
export const WEEKDAYS: { value: number; short: string; name: string }[] = [
  { value: 1, short: "Lun", name: "lunes" },
  { value: 2, short: "Mar", name: "martes" },
  { value: 3, short: "Mié", name: "miércoles" },
  { value: 4, short: "Jue", name: "jueves" },
  { value: 5, short: "Vie", name: "viernes" },
  { value: 6, short: "Sáb", name: "sábado" },
  { value: 0, short: "Dom", name: "domingo" },
];

function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** "viernes y sábado", "todos los días"; null when no day is chosen. */
export function weekdaysSummary(days: readonly number[]): string | null {
  const set = new Set(days);
  if (set.size === 0) return null;
  if (set.size === 7) return "todos los días";
  return joinSpanish(WEEKDAYS.filter((d) => set.has(d.value)).map((d) => d.name));
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "24 oct 2026" from "2026-10-24" (no time zone shift: it is a calendar date). */
export function formatPromoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** One line that says when the promotion runs. */
export function activationSummary(p: Pick<Promotion, "weekdays" | "starts_on" | "ends_on">): string {
  if (p.weekdays && p.weekdays.length > 0) {
    const days = weekdaysSummary(p.weekdays);
    return days === "todos los días" ? "Todos los días" : `Cada ${days}`;
  }
  if (p.starts_on && p.ends_on) {
    return p.starts_on === p.ends_on
      ? `Solo el ${formatPromoDate(p.starts_on)}`
      : `Del ${formatPromoDate(p.starts_on)} al ${formatPromoDate(p.ends_on)}`;
  }
  return "Sin fecha";
}

/** Local calendar date and weekday of the restaurant (`restaurants.timezone`). */
export function localToday(timeZone: string, now: Date = new Date()): { date: string; weekday: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(now);
  } catch {
    return localToday("UTC", now);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday };
}

/**
 * "Activa hoy" means the same as `promotion_runs_on` for today: paused wins,
 * then the date range (end inclusive) or today's weekday.
 */
export function promotionDisplayStatus(
  p: Pick<Promotion, "status" | "weekdays" | "starts_on" | "ends_on">,
  today: { date: string; weekday: number }
): PromotionDisplayStatus {
  if (p.status === "paused") return "paused";
  if (p.weekdays && p.weekdays.length > 0) {
    return p.weekdays.includes(today.weekday) ? "today" : "scheduled";
  }
  if (p.ends_on && p.ends_on < today.date) return "expired";
  if (p.starts_on && p.starts_on > today.date) return "scheduled";
  return "today";
}

/* ------------------------------------------------------------------ */
/* Display-only line math (mirror of line_promotions / promo_line_discount). */

function benefitOf(rule: PromotionRule, variantPrice: number, quantity: number): number {
  if (rule.type === "discount") {
    const value = Number(rule.value ?? 0);
    return rule.value_type === "percent" ? roundCents((variantPrice * value) / 100) : Math.min(value, variantPrice);
  }
  const x = Number(rule.receive_qty ?? 0);
  const y = Number(rule.buy_qty ?? 0);
  if (x < 2 || y < 1 || y >= x) return 0;
  return Math.floor(quantity / x) * (x - y);
}

/** Promotions enabled for one channel ("pos.takeaway" → service_options.pos.takeaway). */
export function promotionsForChannel<T extends Pick<ActivePromotion, "service_options">>(promos: readonly T[], channel: PromotionChannel): T[] {
  const [group, key] = channel.split(".") as [keyof ActivePromotion["service_options"], string];
  return promos.filter((p) => (p.service_options?.[group] as Record<string, boolean> | undefined)?.[key] === true);
}

/** Promotions that target this product (directly or by its category). */
export function promotionsForProduct<T extends ActivePromotion>(
  productId: string,
  categoryId: string | null | undefined,
  promos: readonly T[]
): T[] {
  return promos.filter((p) =>
    p.applies_to === "products" ? p.target_ids.includes(productId) : !!categoryId && p.target_ids.includes(categoryId)
  );
}

/** At most one promotion per type: the biggest benefit for this line (ties: oldest, as listed). */
export function pickLinePromotions<T extends ActivePromotion>(
  productId: string,
  categoryId: string | null | undefined,
  variantPrice: number,
  quantity: number,
  promos: readonly T[]
): T[] {
  const best = new Map<string, { rule: T; benefit: number }>();
  for (const rule of promotionsForProduct(productId, categoryId, promos)) {
    const benefit = benefitOf(rule, variantPrice, quantity);
    if (benefit <= 0) continue;
    const current = best.get(rule.type);
    if (!current || benefit > current.benefit) best.set(rule.type, { rule, benefit });
  }
  return ["buy_x_get_y", "discount"].flatMap((t) => (best.has(t) ? [best.get(t)!.rule] : []));
}

/** Discount of a whole line: percent/fixed per unit on the variant, then free units at the discounted price. */
export function promoLineDiscount(variantPrice: number, quantity: number, rules: readonly PromotionRule[] | null | undefined): number {
  if (!rules?.length || !(variantPrice > 0) || !(quantity >= 1)) return 0;
  let unit = 0;
  let free = 0;
  for (const rule of rules) {
    if (rule.type === "discount") unit = Math.max(unit, benefitOf(rule, variantPrice, quantity));
    else free = Math.max(free, benefitOf(rule, variantPrice, quantity));
  }
  unit = Math.min(unit, variantPrice);
  return Math.min(roundCents(unit * quantity + free * (variantPrice - unit)), roundCents(variantPrice * quantity));
}

export interface LineEstimate {
  listSubtotal: number;
  discount: number;
  subtotal: number;
  labels: string[];
}

/** Estimate for a cart line not sent yet (`unitPrice` = variant + modifiers, as the cart keeps it). */
export function estimateCartLine(
  line: { productId: string; categoryId: string | null | undefined; variantPrice: number; unitPrice: number; quantity: number },
  promos: readonly ActivePromotion[]
): LineEstimate {
  const listSubtotal = roundCents(line.unitPrice * line.quantity);
  const rules = pickLinePromotions(line.productId, line.categoryId, line.variantPrice, line.quantity, promos);
  const discount = promoLineDiscount(line.variantPrice, line.quantity, rules);
  return { listSubtotal, discount, subtotal: roundCents(listSubtotal - discount), labels: rules.map(promotionLabel) };
}

/**
 * What a product tile shows: every promo label for it and, when a discount
 * applies, the price of one unit after it (2x1 alone does not change one unit).
 */
export function productPromoBadge(
  productId: string,
  categoryId: string | null | undefined,
  fromPrice: number,
  promos: readonly ActivePromotion[]
): { labels: string[]; netPrice: number | null } | null {
  const rules = promotionsForProduct(productId, categoryId, promos);
  if (rules.length === 0) return null;
  const discountRules = pickLinePromotions(productId, categoryId, fromPrice, 1, rules).filter((r) => r.type === "discount");
  const off = promoLineDiscount(fromPrice, 1, discountRules);
  const labels = [...new Set(rules.map((r) => r.label || promotionLabel(r)))];
  return { labels, netPrice: off > 0 ? roundCents(fromPrice - off) : null };
}

/* ------------------------------------------------------------------ */
/* Lines already priced by the server (bill_json / order_items).        */

export interface PricedLine extends PromoLineFields {
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/** List price, promo discount and labels of a priced line; `hasPromo` false for old lines. */
export function linePromoView(line: PricedLine): { hasPromo: boolean; listSubtotal: number; discount: number; labels: string[] } {
  const discount = Number(line.promo_discount ?? 0);
  const listSubtotal = line.list_subtotal != null ? Number(line.list_subtotal) : roundCents(line.unit_price * line.quantity);
  const labels = (line.promotions ?? []).map(promotionLabel);
  return { hasPromo: discount > 0, listSubtotal, discount, labels };
}

/**
 * Pay-by-item amount for `units` of a line of which `paidQty` were already
 * paid, using the NET subtotal: each unit is worth subtotal / quantity and the
 * cumulative amount is rounded to the cent, so the last unit absorbs the
 * rounding and all payments of the line add up exactly to its subtotal.
 */
export function splitItemAmount(line: { subtotal: number; quantity: number }, paidQty: number, units: number): number {
  const quantity = line.quantity;
  if (!(quantity > 0) || units <= 0) return 0;
  const from = Math.min(Math.max(paidQty, 0), quantity);
  const to = Math.min(from + units, quantity);
  const upTo = (k: number) => (k >= quantity ? Number(line.subtotal) : roundCents((Number(line.subtotal) * k) / quantity));
  return roundCents(upTo(to) - upTo(from));
}

/* ------------------------------------------------------------------ */
/* Form (save_promotion p_data).                                        */

const uuid = z.uuid({ error: "Selección inválida" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha válida");
const channelsSchema = z.object({
  pos: z.object({ tables: z.boolean(), dine_in_no_table: z.boolean(), takeaway: z.boolean(), delivery: z.boolean() }),
  digital_menu: z.object({ tables: z.boolean(), pickup: z.boolean(), delivery: z.boolean() }),
});

export const promotionFormSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe un nombre").max(80, "Usa hasta 80 caracteres"),
    type: z.enum(["discount", "buy_x_get_y"], { error: "Elige el tipo de promoción" }),
    value_type: z.enum(["percent", "fixed"]).nullable(),
    value: z.number().nullable(),
    receive_qty: z.number().int().nullable(),
    buy_qty: z.number().int().nullable(),
    applies_to: z.enum(["products", "categories"], { error: "Elige si aplica a productos o categorías" }),
    target_ids: z.array(uuid).min(1, "Elige al menos un producto o categoría").max(500, "Demasiados elementos (máximo 500)"),
    activation: z.enum(["weekdays", "dates"]),
    weekdays: z.array(z.number().int().min(0).max(6)),
    starts_on: isoDate.nullable(),
    ends_on: isoDate.nullable(),
    service_options: channelsSchema,
    status: z.enum(["active", "paused"]),
  })
  .superRefine((v, ctx) => {
    if (v.type === "discount") {
      if (!v.value_type) ctx.addIssue({ code: "custom", path: ["value_type"], message: "Elige porcentaje o monto fijo" });
      const max = v.value_type === "percent" ? 100 : 99999.99;
      if (v.value == null || !Number.isFinite(v.value) || v.value <= 0 || v.value > max) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: v.value_type === "percent" ? "Escribe un porcentaje entre 1 y 100" : "Escribe un monto mayor que 0",
        });
      } else if (Math.abs(Math.round(v.value * 100) - v.value * 100) > 1e-6) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Usa como máximo dos decimales" });
      }
    } else {
      if (v.receive_qty == null || v.receive_qty < 2 || v.receive_qty > 99) {
        ctx.addIssue({ code: "custom", path: ["receive_qty"], message: "La cantidad que se lleva debe estar entre 2 y 99" });
      }
      if (v.buy_qty == null || v.buy_qty < 1 || (v.receive_qty != null && v.buy_qty >= v.receive_qty)) {
        ctx.addIssue({ code: "custom", path: ["buy_qty"], message: "La cantidad que se paga debe ser menor que la que se lleva" });
      }
      if (v.activation !== "weekdays") {
        ctx.addIssue({ code: "custom", path: ["activation"], message: "Compra X lleva Y solo se activa por días de la semana" });
      }
    }
    if (v.activation === "weekdays") {
      if (v.weekdays.length === 0) ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Elige al menos un día" });
    } else {
      if (!v.starts_on) ctx.addIssue({ code: "custom", path: ["starts_on"], message: "Elige la fecha de inicio" });
      if (!v.ends_on) ctx.addIssue({ code: "custom", path: ["ends_on"], message: "Elige la fecha de fin" });
      if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
        ctx.addIssue({ code: "custom", path: ["ends_on"], message: "La fecha de fin no puede ser anterior a la de inicio" });
      }
    }
  });

export type PromotionForm = z.infer<typeof promotionFormSchema>;

/** `p_data` for save_promotion: the whole form (an update replaces every field). */
export function toPromotionPayload(v: PromotionForm) {
  const base = {
    name: v.name,
    type: v.type,
    applies_to: v.applies_to,
    target_ids: v.target_ids,
    service_options: v.service_options,
    status: v.status,
  };
  const rule =
    v.type === "discount"
      ? { value_type: v.value_type, value: v.value }
      : { receive_qty: v.receive_qty, buy_qty: v.buy_qty };
  const when =
    v.activation === "weekdays"
      ? { weekdays: [...new Set(v.weekdays)].sort((a, b) => a - b) }
      : { starts_on: v.starts_on, ends_on: v.ends_on };
  return { ...base, ...rule, ...when };
}

/** Form values of an existing promotion (edit). */
export function promotionToForm(p: Promotion): PromotionForm {
  return {
    name: p.name,
    type: p.type,
    value_type: p.value_type,
    value: p.value == null ? null : Number(p.value),
    receive_qty: p.receive_qty,
    buy_qty: p.buy_qty,
    applies_to: p.applies_to,
    target_ids: p.target_ids,
    activation: p.weekdays && p.weekdays.length > 0 ? "weekdays" : "dates",
    weekdays: p.weekdays ?? [],
    starts_on: p.starts_on,
    ends_on: p.ends_on,
    service_options: {
      pos: {
        tables: p.service_options?.pos?.tables !== false,
        dine_in_no_table: p.service_options?.pos?.dine_in_no_table !== false,
        takeaway: p.service_options?.pos?.takeaway !== false,
        delivery: p.service_options?.pos?.delivery !== false,
      },
      digital_menu: {
        tables: p.service_options?.digital_menu?.tables !== false,
        pickup: p.service_options?.digital_menu?.pickup !== false,
        delivery: p.service_options?.digital_menu?.delivery !== false,
      },
    },
    status: p.status,
  };
}
