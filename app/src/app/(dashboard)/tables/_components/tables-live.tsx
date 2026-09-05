"use client";

import { useRouter } from "next/navigation";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { ConnectionStatus } from "@/components/shared/connection-status";

/**
 * Mantiene viva la rejilla de Mesas.
 *
 * Hasta ahora /Mesas era un Server Component puro: se pintaba una vez
 * por navegación y no se enteraba de nada más. Un mesero mirando esa
 * pantalla veía estados y totales congelados indefinidamente — la mesa
 * que otro acababa de liberar seguía apareciendo ocupada.
 *
 * La página sigue siendo Server Component y `getTablesStatus` sigue
 * siendo la única consulta: esto solo le dice cuándo volver a correr.
 * Tiene que ser un refetch completo y no basta con escuchar la tabla
 * `tables`, porque `active_total` no es una columna sino una suma que
 * calcula el propio RPC.
 */
export function TablesLive({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const { connected } = useStaffRealtime(restaurantId, () => router.refresh(), {
    channelName: "staff-tables",
  });

  return <ConnectionStatus connected={connected} />;
}
