"use client";

/**
 * StaffLiveProvider: UNA sola suscripción en vivo para todo el panel.
 *
 * Se monta una vez en `(dashboard)/layout.tsx` (el layout persiste entre
 * pantallas) y reemplaza a las suscripciones sueltas que tenían
 * DashboardNotifier, OrdersBoard, los contadores del menú, KitchenBoard y
 * TablesLive: antes un solo pedido nuevo disparaba 4-5 refetch por Server
 * Action, cada uno pasando por el proxy. Ahora: un canal, un almacén y,
 * por evento, solo las lecturas que ese evento invalida, directas desde
 * el navegador a los RPC (ver `lib/queries/staff-client.ts`).
 *
 * ── API ───────────────────────────────────────────────────────────────
 *   <StaffLiveProvider restaurantId role>  // en el layout, una vez
 *
 *   useLiveOrders()    -> StaffOrder[] | null   pedidos activos
 *                         (PENDING/ACCEPTED/PREPARING/READY); null = aún
 *                         sin cargar (usa los datos iniciales del servidor).
 *   useLiveCalls()     -> StaffWaiterCall[] | null   PENDING/ACCEPTED
 *   useLiveCounters()  -> StaffCounters   contadores del menú (get_staff_counters)
 *   useLiveConnected() -> boolean         socket vivo Y navegador en línea
 *   useLiveActions()   -> {
 *       refresh(): Promise<void>      recarga todo (orders, calls, contadores)
 *       afterMutation(): void         llamar tras una Server Action de
 *                                     escritura; NO recarga si el evento de
 *                                     Realtime llega solo (lo verifica a
 *                                     1.5 s y recarga solo si no llegó).
 *       removeOrder(id): void         quita un pedido del almacén (optimista)
 *   }
 *   useLiveEvents(tables, handler)      registra `handler` para que corra,
 *                                       ya fusionado (≈120 ms) con otros
 *                                       eventos, cuando cambie alguna de
 *                                       `tables`, y en cada recarga completa
 *                                       (reconexión/sondeo). Es lo que usan
 *                                       Cocina (comandas) y Mesas
 *                                       (router.refresh con debounce).
 *
 * Tablas del canal: orders, waiter_calls, tables, tickets, bills,
 * cash_sessions, availability. Caja y Disponibilidad pueden adoptarlo con
 * `useLiveEvents(["bills", "cash_sessions"], ...)` en vez de montar su
 * propio `useStaffRealtime` (solo hay que quitar el hook de esa pantalla).
 *
 * Reglas que mantiene (no perderlas):
 *  - Un evento no dispara dos lecturas de lo mismo: los eventos se funden
 *    en una pasada y cada lectura tiene su propia cola (una en vuelo + una
 *    repetición pendiente), así que una lectura a medias nunca se descarta.
 *  - Sondeo de respaldo cada 20 s SOLO si el socket está caído y la
 *    pestaña visible (lo hace `useStaffRealtime`).
 *  - Reconexión: recarga completa (recupera lo ocurrido durante el corte).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useStaffRealtime, type StaffTable } from "@/hooks/use-staff-realtime";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import {
  readStaffCounters,
  readStaffOrders,
  readWaiterCalls,
} from "@/lib/queries/staff-client";
import { EMPTY_COUNTERS, type StaffCounters } from "@/lib/staff-counters";
import type { OrderStatus } from "@/config/constants";
import type { StaffOrder, StaffWaiterCall } from "@/types/staff";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["PENDING", "ACCEPTED", "PREPARING", "READY"];
const OPEN_CALL_STATUSES: ("PENDING" | "ACCEPTED")[] = ["PENDING", "ACCEPTED"];

const WATCHED: StaffTable[] = [
  "orders",
  "waiter_calls",
  "tables",
  "tickets",
  "bills",
  "cash_sessions",
  "availability",
];
/** Los eventos de estas tablas cambian los contadores del menú. */
const COUNTER_TABLES: StaffTable[] = ["orders", "tickets", "waiter_calls", "tables"];
/** Fusiona la ráfaga de eventos de una misma transacción (pedido + comanda + mesa). */
const COALESCE_MS = 120;
/** Tras una mutación, cuánto esperar el evento antes de recargar por si acaso. */
const MUTATION_GRACE_MS = 1500;

interface LiveState {
  orders: StaffOrder[] | null;
  calls: StaffWaiterCall[] | null;
  counters: StaffCounters;
  connected: boolean;
}

function createStore() {
  let state: LiveState = {
    orders: null,
    calls: null,
    counters: EMPTY_COUNTERS,
    connected: false,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<LiveState>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type Store = ReturnType<typeof createStore>;

interface Handler {
  tables: ReadonlySet<StaffTable>;
  run: () => void | Promise<void>;
}

interface LiveContextValue {
  store: Store;
  refresh: () => Promise<void>;
  afterMutation: () => void;
  removeOrder: (id: string) => void;
  addHandler: (handler: Handler) => () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("StaffLiveProvider no está montado en el layout del panel.");
  return ctx;
}

function useSelector<T>(selector: (s: LiveState) => T): T {
  const { store } = useLive();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get())
  );
}

/** Una lectura a la vez; si llega otra petición mientras corre, se repite una vez al terminar. */
function coalesced(fn: () => Promise<void>): () => Promise<void> {
  let inFlight = false;
  let again = false;
  return async () => {
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    try {
      do {
        again = false;
        await fn();
      } while (again);
    } finally {
      inFlight = false;
    }
  };
}

export function StaffLiveProvider({
  restaurantId,
  children,
}: {
  restaurantId: string;
  /** Reservado: hoy todos los roles leen lo mismo (la RPC filtra por membresía). */
  role?: string;
  children: ReactNode;
}) {
  const [store] = useState(createStore);
  // Las lecturas en vivo no pasan por el proxy: el latido mantiene la
  // revocación de dispositivos (M10) aunque la pantalla no navegue.
  useSessionHeartbeat();

  const handlers = useRef(new Set<Handler>());
  const dirty = useRef(new Set<StaffTable>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventAt = useRef(0);

  const loadOrders = useMemo(
    () =>
      coalesced(async () => {
        try {
          store.set({ orders: await readStaffOrders(restaurantId, ACTIVE_ORDER_STATUSES) });
        } catch {
          // Silencioso: la reconexión y el sondeo reintentan.
        }
      }),
    [restaurantId, store]
  );
  const loadCalls = useMemo(
    () =>
      coalesced(async () => {
        try {
          store.set({ calls: await readWaiterCalls(restaurantId, OPEN_CALL_STATUSES) });
        } catch {
          // Silencioso: la reconexión y el sondeo reintentan.
        }
      }),
    [restaurantId, store]
  );
  const loadCounters = useMemo(
    () =>
      coalesced(async () => {
        try {
          store.set({ counters: await readStaffCounters(restaurantId) });
        } catch {
          // Silencioso: la reconexión y el sondeo reintentan.
        }
      }),
    [restaurantId, store]
  );

  const runHandlers = useCallback((changed: ReadonlySet<StaffTable> | null) => {
    for (const h of handlers.current) {
      if (changed === null || [...changed].some((t) => h.tables.has(t))) void h.run();
    }
  }, []);

  /** Recarga completa: carga inicial, reconexión, sondeo sin socket, "online". */
  const refresh = useCallback(async () => {
    await Promise.all([loadOrders(), loadCalls(), loadCounters()]);
    runHandlers(null);
  }, [loadOrders, loadCalls, loadCounters, runHandlers]);

  const flush = useCallback(() => {
    flushTimer.current = null;
    const changed = new Set(dirty.current);
    dirty.current.clear();
    if (changed.has("orders")) void loadOrders();
    if (changed.has("waiter_calls")) void loadCalls();
    if (COUNTER_TABLES.some((t) => changed.has(t))) void loadCounters();
    runHandlers(changed);
  }, [loadOrders, loadCalls, loadCounters, runHandlers]);

  const onEvent = useCallback(
    (table: StaffTable) => {
      lastEventAt.current = Date.now();
      dirty.current.add(table);
      if (!flushTimer.current) flushTimer.current = setTimeout(flush, COALESCE_MS);
    },
    [flush]
  );

  const { connected } = useStaffRealtime(restaurantId, refresh, {
    channelName: "staff-live",
    tables: WATCHED,
    // Los datos iniciales de las pantallas vienen del servidor, pero el
    // almacén (y el notificador) necesitan su propia línea base.
    immediate: true,
    onEvent,
  });

  useEffect(() => {
    store.set({ connected });
  }, [connected, store]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    []
  );

  const connectedRef = useRef(connected);
  useEffect(() => {
    connectedRef.current = connected;
  });

  const afterMutation = useCallback(() => {
    if (!connectedRef.current) {
      void refresh();
      return;
    }
    // Con socket vivo el evento llega solo. Si pasado un momento no llegó
    // nada (p. ej. el canal quedó SUBSCRIBED sin recibir), se recarga.
    const startedAt = Date.now();
    setTimeout(() => {
      if (lastEventAt.current < startedAt) void refresh();
    }, MUTATION_GRACE_MS);
  }, [refresh]);

  const removeOrder = useCallback(
    (id: string) => {
      const orders = store.get().orders;
      if (orders) store.set({ orders: orders.filter((o) => o.id !== id) });
    },
    [store]
  );

  const addHandler = useCallback((handler: Handler) => {
    handlers.current.add(handler);
    return () => void handlers.current.delete(handler);
  }, []);

  const value = useMemo<LiveContextValue>(
    () => ({ store, refresh, afterMutation, removeOrder, addHandler }),
    [store, refresh, afterMutation, removeOrder, addHandler]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLiveOrders = () => useSelector((s) => s.orders);
export const useLiveCalls = () => useSelector((s) => s.calls);
export const useLiveCounters = () => useSelector((s) => s.counters);
export const useLiveConnected = () => useSelector((s) => s.connected);

export function useLiveActions() {
  const { refresh, afterMutation, removeOrder } = useLive();
  return useMemo(() => ({ refresh, afterMutation, removeOrder }), [refresh, afterMutation, removeOrder]);
}

/** `handler` corre fusionado cuando cambie alguna de `tables` y en cada recarga completa. */
export function useLiveEvents(tables: StaffTable[], handler: () => void | Promise<void>) {
  const { addHandler } = useLive();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = tables.join(",");
  useEffect(
    () =>
      addHandler({
        tables: new Set(key.split(",") as StaffTable[]),
        run: () => handlerRef.current(),
      }),
    [addHandler, key]
  );
}
