"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Cada cuánto corre la red de seguridad, con o sin socket vivo. */
const SAFETY_NET_MS = 20_000;

export type StaffTable = "orders" | "waiter_calls" | "tables";

const DEFAULT_TABLES: StaffTable[] = ["orders", "waiter_calls", "tables"];

/**
 * Actualización en vivo del panel del personal.
 *
 * Realtime de verdad (no sondeo): el personal SÍ tiene política RLS de
 * SELECT, así que la suscripción funciona de forma nativa. Ante
 * cualquier cambio se vuelve a pedir la lista completa vía RPC — más
 * simple y menos propenso a desincronizarse que parchear el estado a
 * mano con un payload parcial.
 *
 * Pero un WebSocket en el wifi de un restaurante se cae, y la versión
 * anterior de este hook llamaba a `.subscribe()` sin callback de
 * estado: nunca se enteraba de que el canal había muerto, los eventos
 * del corte se perdían para siempre y el mesero no veía ninguna señal.
 * Ese es el peor fallo posible en una comanda — creer que no hay
 * pedidos cuando en realidad no están llegando.
 *
 * Por eso este hook hace tres cosas más:
 *
 * 1. **Vigila el estado del canal.** `SUBSCRIBED` es conectado;
 *    `CHANNEL_ERROR`, `TIMED_OUT` y `CLOSED` son desconectado, y se
 *    exponen para que la interfaz pueda decirlo.
 * 2. **Refetch al reconectar.** Es la pieza clave: recupera de una vez
 *    todo lo que ocurrió mientras el socket estuvo muerto.
 * 3. **Red de seguridad cada 20 s**, siempre, haya socket o no. Con el
 *    socket vivo un pedido entra en menos de un segundo; con el socket
 *    muerto, en menos de veinte. Nunca se pierde.
 *
 * Dos detalles que costaron caro y no hay que perder:
 *
 * - `postgres_changes` evalúa la RLS con el JWT que la conexión de
 *   Realtime tenga cargado, y NO lo hereda de la sesión de auth. Sin
 *   `realtime.setAuth(token)` el canal queda "SUBSCRIBED" pero nunca
 *   recibe nada, filtrado en silencio y sin error visible.
 * - En desarrollo StrictMode monta el efecto dos veces; como crear el
 *   canal depende de un `await`, sin bandera de cancelación la segunda
 *   invocación intenta escuchar un canal que la primera ya dejó
 *   suscrito y Supabase lo rechaza.
 */
export function useStaffRealtime(
  restaurantId: string,
  onChange: () => void | Promise<void>,
  {
    channelName = "staff",
    tables = DEFAULT_TABLES,
  }: { channelName?: string; tables?: StaffTable[] } = {}
) {
  // El callback más reciente, sin meterlo en las dependencias del efecto
  // de suscripción (si no, cada render recrearía el canal WebSocket).
  // La asignación va DENTRO de un efecto: escribir un ref durante el
  // render rompe el render concurrente y React Compiler lo marca.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Dos señales, porque ninguna basta sola:
  //  - `channelOk`: lo que dice Supabase. Es la verdad sobre si llegan
  //    eventos, pero tarda hasta un heartbeat (~30 s) en enterarse de
  //    que el socket murió. Durante ese rato el indicador mentiría.
  //  - `online`: lo que dice el navegador. Es instantáneo cuando se cae
  //    el wifi, pero no sabe nada de si el canal funciona.
  // Conectado = las dos a la vez.
  const [channelOk, setChannelOk] = useState(false);
  const [online, setOnline] = useState(true);
  const connected = channelOk && online;

  // Evita que dos eventos seguidos lancen dos recargas a la vez: la
  // segunda leería datos a medio escribir y competiría con la primera.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await onChangeRef.current();
    } finally {
      inFlight.current = false;
    }
  }, []);

  // `tables` llega como array literal desde el componente, así que
  // cambiaría de identidad en cada render y reiniciaría la suscripción.
  const tablesKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const watched = tablesKey.split(",") as StaffTable[];
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Solo se recarga al RE-conectar, no en la primera conexión: los
    // datos iniciales ya vienen renderizados del servidor.
    let wasConnected = false;

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

      let builder = supabase.channel(`${channelName}:${restaurantId}`);
      for (const table of watched) {
        builder = builder.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          () => void refresh()
        );
      }

      channel = builder.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setChannelOk(true);
          // Aquí se recupera todo lo ocurrido durante el corte.
          if (wasConnected) void refresh();
          wasConnected = true;
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setChannelOk(false);
        }
      });
    }

    setup();

    // La red de seguridad. Corre pase lo que pase con el socket.
    const safetyNet = setInterval(() => void refresh(), SAFETY_NET_MS);

    // La tablet que se durmió o el celular que recuperó señal se ponen
    // al día al instante, sin esperar al siguiente ciclo.
    function onWake() {
      if (!document.hidden) void refresh();
    }
    function onOnline() {
      setOnline(true);
      onWake();
    }
    function onOffline() {
      setOnline(false);
    }
    setOnline(navigator.onLine);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      clearInterval(safetyNet);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      authListener.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [restaurantId, channelName, tablesKey, refresh]);

  return { connected, refresh };
}
