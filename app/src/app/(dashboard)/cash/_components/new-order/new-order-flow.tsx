"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Bike, Loader2, Plus, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChoiceCards } from "@/components/shared/choice-card";
import { posPressable } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import type { OrderKind } from "./order-builder";

// El constructor (carta, fichas, formulario de domicilio) solo se descarga
// cuando alguien toca "Nuevo pedido": /cash carga liviana para cobrar.
const OrderBuilder = dynamic(() => import("./order-builder").then((m) => m.OrderBuilder), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background" role="status">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">Abriendo la carta…</span>
    </div>
  ),
});

/**
 * "Nuevo pedido" en Caja: primero se elige el tipo (tres tarjetas grandes),
 * después se abre el constructor a pantalla completa. Para llevar y
 * domicilio terminan en "Cobrar ahora" o "Cobrar después"; mesa termina en
 * "Enviar a cocina" (se cobra desde Por cobrar cuando pidan la cuenta).
 */
export function NewOrderFlow({
  canCharge,
  billingEnabled,
  onChargeNow,
  className,
}: {
  canCharge: boolean;
  billingEnabled: boolean;
  onChargeNow: (tableSessionId: string, label: string) => void;
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const [kind, setKind] = useState<OrderKind | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={cn(
          posPressable,
          "flex min-h-16 w-full items-center justify-center gap-3 rounded-card bg-primary px-5 text-lead font-semibold text-primary-foreground shadow-md hover:bg-primary-hover",
          className
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground/15">
          <Plus className="size-6" strokeWidth={2.5} aria-hidden />
        </span>
        Nuevo pedido
      </button>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-title-sm">¿Qué tipo de pedido es?</DialogTitle>
            <DialogDescription>Elige uno y arma el pedido. Puedes cobrarlo al final o después.</DialogDescription>
          </DialogHeader>
          <ChoiceCards<OrderKind>
            label="Tipo de pedido"
            value={null}
            onChange={(v) => {
              setKind(v);
              setPicking(false);
            }}
            options={[
              { value: "takeaway", title: "Para llevar", description: "El cliente espera y se lo lleva.", icon: ShoppingBag, tone: "money-in" },
              { value: "table", title: "Mesa", description: "Comanda a una mesa del salón.", icon: UtensilsCrossed, tone: "info" },
              { value: "delivery", title: "Domicilio", description: "Envío propio o por plataforma.", icon: Bike, tone: "attention" },
            ]}
          />
        </DialogContent>
      </Dialog>

      {kind && (
        <OrderBuilder
          kind={kind}
          canCharge={canCharge && billingEnabled}
          onChangeKind={() => {
            setKind(null);
            setPicking(true);
          }}
          onClose={() => setKind(null)}
          onChargeNow={(id, label) => {
            setKind(null);
            onChargeNow(id, label);
          }}
        />
      )}
    </>
  );
}
