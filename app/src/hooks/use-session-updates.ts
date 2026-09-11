"use client";

import { useEffect, useRef } from "react";

/**
 * Mantiene al día lo que el comensal tiene en curso en su mesa.
 *
 * Sustituye al sondeo cada 4 s que había antes duplicado en
 * `table-status-provider` y `order-tracker`. Ese sondeo era el que hacía
 * que la app se sintiera trabada: cada vuelta era una Server Action, y
 * React las serializa — si al tocar un enlace había una consulta en
 * vuelo, la navegación se ponía en cola detrás de ella. De ahí los
 * "segundos" al pulsar.
 *
 * Ahora hay dos vías:
 *
 *  1. **La señal de Realtime.** Un trigger en Postgres emite un aviso
 *     VACÍO al canal de esta mesa cuando cambia un pedido o una
 *     solicitud. Al recibirlo se piden los datos una vez. Cero
 *     peticiones mientras no pasa nada.
 *  2. **Una red de seguridad muy espaciada** (30 s por defecto, contra
 *     los 4 s de antes) por si el WebSocket se cae en la wifi del local
 *     sin avisar. Se pausa con la pestaña oculta, igual que antes.
 *
 * El cliente de Supabase se carga con `import()` dinámico a propósito:
 * así el paquete no entra en la carga inicial de la carta, que es
 * justamente lo que se estaba intentando aligerar. Llega después, cuando
 * la pantalla ya es usable.
 */
export function useSessionUpdates({
  channelName,
  onUpdate,
  safetyNetMs = 30_000,
}: {
  /** null = el cliente no está en una mesa: no se suscribe ni sondea. */
  channelName: string | null;
  onUpdate: () => void | Promise<void>;
  safetyNetMs?: number;
}) {
  // El callback más reciente sin que su identidad reinicie la
  // suscripción. La asignación va dentro de un efecto: escribirlo
  // durante el render rompe el render concurrente.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    if (!channelName) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disconnect: (() => void) | undefined;

    function run() {
      if (cancelled || document.hidden) return;
      void onUpdateRef.current();
    }

    // Se rearma AL TERMINAR, no cada N ms pase lo que pase: con
    // setInterval, una consulta lenta —el 3G de un local a mediodía—
    // acumulaba una cola que no drenaba nunca.
    function scheduleSafetyNet() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (!cancelled && !document.hidden) await onUpdateRef.current();
        scheduleSafetyNet();
      }, safetyNetMs);
    }
    scheduleSafetyNet();

    // Al volver a la pestaña, refrescar de inmediato en vez de esperar
    // hasta 30 s mirando datos viejos.
    function onWake() {
      if (!document.hidden) run();
    }
    document.addEventListener("visibilitychange", onWake);

    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      if (cancelled) return;
      const supabase = createClient();

      // Canal PRIVADO y `setAuth()`: Broadcast-desde-la-base pasa por
      // Realtime Authorization, que exige ambas cosas. Con un canal
      // público el mensaje se escribe en `realtime.messages` pero no se
      // entrega a nadie — falla en silencio, sin error ni en el cliente
      // ni en la base (verificado a mano antes de dar esto por bueno).
      // La autorización la concede una policy sobre `realtime.messages`
      // que solo deja leer temas con la forma `session:<64 hex>`.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const channel = supabase
        .channel(channelName, { config: { private: true } })
        .on("broadcast", { event: "session_changed" }, () => run())
        .subscribe();
      disconnect = () => void supabase.removeChannel(channel);
      if (cancelled) disconnect();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      disconnect?.();
    };
  }, [channelName, safetyNetMs]);
}
