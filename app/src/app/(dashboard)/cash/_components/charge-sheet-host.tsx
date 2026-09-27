"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canHandleMoney } from "@/lib/permissions";
import { ChargeSheet } from "./charge-sheet";
import type { UserRole } from "@/config/constants";

interface OpenChargeOptions {
  tableSessionId: string;
  tableLabel: string;
  /** Tope de descuento del mesero para esta apertura. Si se omite se usa el
   * que trae el provider (de `getRestaurantSettings` en el layout). */
  maxWaiterDiscountPct?: number;
}

interface ChargeSheetContextValue {
  openCharge: (options: OpenChargeOptions) => void;
}

const ChargeSheetContext = createContext<ChargeSheetContextValue | null>(null);

/**
 * Hoja de cobro "host": una única instancia de `ChargeSheet` montada en el
 * layout del panel, fuera de cualquier lista (llamadas, mesas, cuentas
 * abiertas). Antes cada tarjeta montaba su propio `ChargeSheet`; al cobrar,
 * la llamada BILL pasaba a ATTENDED y la mesa a AVAILABLE, el refresco en
 * tiempo real desmontaba esa tarjeta a mitad de cobro y la hoja (con el
 * "Mesa cobrada ✓" y el botón de imprimir ticket) desaparecía con ella. Con
 * un host único la hoja vive en un componente que ninguna lista puede
 * desmontar.
 */
export function ChargeSheetProvider({
  role,
  maxWaiterDiscountPct,
  children,
}: {
  role: UserRole;
  maxWaiterDiscountPct: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Required<OpenChargeOptions> | null>(null);

  const canCharge = canHandleMoney(role);

  const openCharge = useCallback(
    (options: OpenChargeOptions) => {
      if (!canCharge) return;
      setTarget({
        tableSessionId: options.tableSessionId,
        tableLabel: options.tableLabel,
        maxWaiterDiscountPct: options.maxWaiterDiscountPct ?? maxWaiterDiscountPct,
      });
      setOpen(true);
    },
    [canCharge, maxWaiterDiscountPct]
  );

  const value = useMemo<ChargeSheetContextValue>(() => ({ openCharge }), [openCharge]);

  return (
    <ChargeSheetContext.Provider value={value}>
      {children}
      {canCharge && target && (
        <ChargeSheet
          key={target.tableSessionId}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            // Se cierra a mano (la "X" del Sheet o tocar fuera): la cuenta
            // pudo haber cambiado (pagos parciales) aunque no haya llegado
            // a CLOSED, así que igual conviene refrescar las listas.
            if (!next) router.refresh();
          }}
          tableSessionId={target.tableSessionId}
          tableLabel={target.tableLabel}
          role={role}
          maxWaiterDiscountPct={target.maxWaiterDiscountPct}
          onSettled={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </ChargeSheetContext.Provider>
  );
}

/** Abre la hoja de cobro "host" para una sesión de mesa. No hace nada si el
 * rol actual no puede manejar dinero (WAITER con cobro activo, KITCHEN). */
export function useChargeSheet(): ChargeSheetContextValue {
  const ctx = useContext(ChargeSheetContext);
  if (!ctx) {
    throw new Error("useChargeSheet debe usarse dentro de <ChargeSheetProvider>");
  }
  return ctx;
}
