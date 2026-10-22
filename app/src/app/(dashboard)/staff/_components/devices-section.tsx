import { createClient } from "@/lib/supabase/server";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import type { DeviceRow } from "@/lib/validations/devices";
import { DevicesPanel } from "./devices-panel";

/** Sección "Dispositivos con acceso por PIN". list_devices solo responde a dueño y administrador. */
export async function DevicesSection({ restaurantId }: { restaurantId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_devices", { p_restaurant_id: restaurantId });
  if (error) {
    if (error.code !== "42501") console.error("[DevicesSection]", error.code);
    return null; // sin permiso o sin la migración: la sección no aparece
  }
  return (
    <DevicesPanel
      restaurantId={restaurantId}
      devices={(data ?? []) as unknown as DeviceRow[]}
      keyConfigured={isAdminClientConfigured()}
    />
  );
}
