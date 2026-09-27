"use server";

import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import {
  reportRangeSchema,
  reportRangeWithGranularitySchema,
  type ReportRangeInput,
  type ReportRangeWithGranularityInput,
} from "@/lib/validations/reports";
import type { ActionResult } from "@/types/actions";
import type {
  DiscountRow,
  PaymentsByMethodRow,
  PeakHoursRow,
  PrepTimesRow,
  SalesByCategoryRow,
  SalesByPeriodRow,
  SalesByProductRow,
  SalesByStaffRow,
  SalesSummary,
} from "@/types/reports";

/**
 * Lecturas del módulo Reportes (M14–M15). Solo OWNER/ADMIN puede llamarlas
 * (lo valida `report_guard` en la base); aquí solo se valida forma y se
 * traduce el error, igual que en `actions/billing.ts`. Son de solo lectura:
 * ninguna revalida rutas.
 */

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

async function run<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await callUntypedRpc<T>(supabase, fn, args);
    if (error) {
      // P0001/22023/42501/28000/P0002 = errores de report_guard o de la
      // propia RPC pensados para mostrarse. Cualquier otro código (tipo,
      // permisos de columna, PostgREST) es interno.
      if (["P0001", "22023", "42501", "28000", "P0002"].includes(error.code ?? "")) {
        return { ok: false, error: error.message };
      }
      console.error(`[rpc ${fn}]`, error.code, error.message);
      return { ok: false, error: "No se pudo generar el reporte. Intenta de nuevo." };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "No se pudo generar el reporte. Intenta de nuevo." };
  }
}

function parseRange(input: ReportRangeInput) {
  return reportRangeSchema.safeParse(input);
}

export async function getSalesSummary(input: ReportRangeInput): Promise<ActionResult<SalesSummary>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<SalesSummary>("report_sales_summary", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getSalesByPeriod(
  input: ReportRangeWithGranularityInput
): Promise<ActionResult<SalesByPeriodRow[]>> {
  const parsed = reportRangeWithGranularitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<SalesByPeriodRow[]>("report_sales_by_period", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
    p_granularity: v.granularity,
  });
}

export async function getSalesByProduct(input: ReportRangeInput): Promise<ActionResult<SalesByProductRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<SalesByProductRow[]>("report_sales_by_product", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getSalesByCategory(input: ReportRangeInput): Promise<ActionResult<SalesByCategoryRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<SalesByCategoryRow[]>("report_sales_by_category", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getSalesByStaff(input: ReportRangeInput): Promise<ActionResult<SalesByStaffRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<SalesByStaffRow[]>("report_sales_by_staff", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getPaymentsByMethod(
  input: ReportRangeInput
): Promise<ActionResult<PaymentsByMethodRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<PaymentsByMethodRow[]>("report_payments_by_method", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getPeakHours(input: ReportRangeInput): Promise<ActionResult<PeakHoursRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<PeakHoursRow[]>("report_peak_hours", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getPrepTimes(input: ReportRangeInput): Promise<ActionResult<PrepTimesRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<PrepTimesRow[]>("report_prep_times", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

export async function getDiscountsReport(input: ReportRangeInput): Promise<ActionResult<DiscountRow[]>> {
  const parsed = parseRange(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  return run<DiscountRow[]>("report_discounts", {
    p_restaurant_id: v.restaurantId,
    p_from: v.from,
    p_to: v.to,
  });
}

/**
 * Todo el paquete de un rango en una sola llamada desde el cliente (evita
 * nueve round-trips separados al cambiar el selector de fechas).
 */
export async function getReportsBundle(input: ReportRangeWithGranularityInput) {
  const [summary, byPeriod, byProduct, byCategory, byStaff, byMethod, peakHours, prepTimes, discounts] =
    await Promise.all([
      getSalesSummary(input),
      getSalesByPeriod(input),
      getSalesByProduct(input),
      getSalesByCategory(input),
      getSalesByStaff(input),
      getPaymentsByMethod(input),
      getPeakHours(input),
      getPrepTimes(input),
      getDiscountsReport(input),
    ]);
  return { summary, byPeriod, byProduct, byCategory, byStaff, byMethod, peakHours, prepTimes, discounts };
}

export type ReportsBundleResult = Awaited<ReturnType<typeof getReportsBundle>>;
