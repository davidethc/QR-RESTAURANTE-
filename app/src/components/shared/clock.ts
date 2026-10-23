"use client";

import { useSyncExternalStore } from "react";

/**
 * Reloj compartido del panel.
 *
 * Antes cada `ElapsedTimer` y cada cronómetro del KDS creaba su propio
 * `setInterval` de 1 s: con 30 tarjetas en pantalla eran 30 temporizadores
 * y 30 renders por segundo. Aquí hay UN reloj por precisión, a nivel de
 * módulo, que solo corre mientras haya alguien suscrito:
 *
 * - "minute": tic cada 15 s. Para textos en minutos ("Hace 5 min").
 * - "second": tic cada 1 s. SOLO donde se muestran segundos (KDS).
 *
 * `useNow(precision)` devuelve la hora del último tic (ms), o `null` en el
 * servidor y en la hidratación, así el primer render coincide en ambos.
 */
export type ClockPrecision = "minute" | "second";

const PERIOD_MS: Record<ClockPrecision, number> = { minute: 15_000, second: 1_000 };

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const clocks: Record<ClockPrecision, Clock> = {
  minute: { now: 0, listeners: new Set(), timer: null },
  second: { now: 0, listeners: new Set(), timer: null },
};

function subscribeTo(precision: ClockPrecision) {
  const clock = clocks[precision];
  return (listener: () => void) => {
    // Al arrancar (o rearrancar) se toma la hora de inmediato, para que
    // un suscriptor tardío no lea una hora vieja de un tic anterior.
    if (clock.listeners.size === 0) {
      clock.now = Date.now();
      clock.timer = setInterval(() => {
        clock.now = Date.now();
        clock.listeners.forEach((l) => l());
      }, PERIOD_MS[precision]);
    }
    clock.listeners.add(listener);
    return () => {
      clock.listeners.delete(listener);
      if (clock.listeners.size === 0 && clock.timer) {
        clearInterval(clock.timer);
        clock.timer = null;
      }
    };
  };
}

const subscribers = {
  minute: subscribeTo("minute"),
  second: subscribeTo("second"),
};

const getServerNow = () => null;

export function useNow(precision: ClockPrecision): number | null {
  return useSyncExternalStore(
    subscribers[precision],
    () => (clocks[precision].now || null),
    getServerNow
  );
}
