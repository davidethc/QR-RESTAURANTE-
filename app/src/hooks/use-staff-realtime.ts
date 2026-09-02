"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Realtime de verdad (no sondeo): el personal SÍ tiene política RLS
 * de SELECT sobre orders/waiter_calls, así que la suscripción funciona
 * de forma nativa. Ante cualquier cambio se vuelve a pedir la lista
 * completa vía el RPC correspondiente — más simple y menos propenso a
 * desincronizarse que parchear el estado a mano con el payload parcial.
 *
 * Detalle crítico #1: postgres_changes evalúa RLS con el JWT que la
 * conexión de Realtime tenga cargado — el cliente NO lo hereda solo
 * de la sesión de auth. Sin `realtime.setAuth(token)` el canal queda
 * "SUBSCRIBED" pero nunca recibe nada (RLS lo filtra en silencio,
 * sin error visible). Hay que fijarlo al conectar y refrescarlo
 * cuando el token rota.
 *
 * Detalle crítico #2: en desarrollo, StrictMode monta el efecto dos
 * veces. Como crear el canal depende de `getSession()` (asíncrono),
 * sin una bandera de cancelación la segunda invocación puede intentar
 * escuchar un canal que la primera ya dejó "subscribed", y Supabase
 * lo rechaza con un error. `cancelled` evita que una invocación
 * obsoleta llegue a crear el canal.
 */
export function useStaffRealtime(restaurantId: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
        }
      }
    );

    async function setup() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`staff:${restaurantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          () => onChangeRef.current()
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "waiter_calls",
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          () => onChangeRef.current()
        )
        .subscribe();
    }

    setup();

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [restaurantId]);
}
