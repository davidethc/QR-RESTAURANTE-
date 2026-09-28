import { createClient } from "@/lib/supabase/server";

export type ReportsTimezoneSettings = {
  timezone: string;
  business_day_cutoff: string;
};

/**
 * Solo lo que necesita el selector de rango de /reports para calcular "Hoy"
 * y "Ayer" en el mismo día comercial que usan las RPCs `report_*`
 * (`business_date()`, ver `20260926160000_restaurant_local_time_helpers.sql`).
 * Consulta aparte de `getRestaurantSettings` para no acoplar el tipo
 * compartido de cobro a una columna que solo necesita este módulo.
 */
export async function getReportsTimezoneSettings(
  restaurantId: string
): Promise<ReportsTimezoneSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("timezone, business_day_cutoff")
    .eq("id", restaurantId)
    .single();

  if (error) throw error;
  return data;
}
