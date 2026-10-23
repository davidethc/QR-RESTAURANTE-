"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bell, CircleCheck, Clock, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/lib/notifications";
import { callWaiter } from "@/lib/actions/waiter-calls";
import { useTableStatus } from "./table-status-provider";
import { cn } from "@/lib/utils";
import { formatCountdown, secondsLeft } from "@/lib/validations/qr-client";
import type { SessionCall } from "@/types/orders";

// Pasado este tiempo, una solicitud sin atender vuelve a permitir
// insistir. Sin esto el cliente queda encerrado justo cuando más
// necesita llamar: cuando nadie le hizo caso.
const REOPEN_AFTER_MS = 5 * 60 * 1000;

/**
 * `true` cuando ya pasó el instante `deadline`.
 *
 * Antes esto era un `Date.now()` suelto en el cuerpo del componente, y
 * tenía dos problemas de verdad, no solo de lint:
 *
 * 1. El valor se congelaba: se calculaba una vez por render, así que una
 *    solicitud sin atender NUNCA llegaba sola a "Volver a llamar" — solo
 *    cambiaba si algo ajeno provocaba otro render. Justo el caso en que
 *    el cliente más necesita insistir.
 * 2. Con el shell estático, el servidor evaluaba el reloj en un momento
 *    y el navegador en otro, lo que da desajuste de hidratación.
 *
 * `useSyncExternalStore` es la API pensada exactamente para esto: el
 * snapshot del servidor es siempre `false` (nada es viejo todavía) y en
 * el cliente se programa UN temporizador para el instante exacto del
 * cambio, en vez de sondear el reloj.
 */
function usePastDeadline(deadline: number | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (deadline === null) return () => {};
      const ms = deadline - Date.now();
      if (ms <= 0) return () => {};
      const timer = setTimeout(onChange, ms);
      return () => clearTimeout(timer);
    },
    [deadline]
  );

  return useSyncExternalStore(
    subscribe,
    () => deadline !== null && Date.now() >= deadline,
    () => false
  );
}

/**
 * Segundos que faltan para `endsAt` (epoch ms), contando de uno en uno.
 * 0 = ya se puede. El primer render del servidor siempre da 0 (sin reloj).
 */
function useCountdown(endsAt: number): number {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (endsAt <= 0) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt <= 0 || now === null) return 0;
  return secondsLeft(endsAt, now);
}

/**
 * Llamar al mesero y pedir la cuenta.
 *
 * Cada botón muestra el estado de su propia solicitud. Antes ese estado
 * vivía en dos filas aparte, arriba de la carta, mientras el botón de
 * aquí seguía diciendo "Llamar mesero" como si no hubieras llamado —
 * información repetida en un sitio y ausente donde hacía falta. El
 * control que provoca el estado es el que debe mostrarlo.
 */
export function ServiceButtons({ tableNumber }: { tableNumber: number }) {
  const { calls, hasAnyOrder, billPaid, billRequested, waiterCooldownEnds, billCooldownEnds } =
    useTableStatus();
  const waiterLeft = useCountdown(waiterCooldownEnds);
  const billLeft = useCountdown(billCooldownEnds);

  if (billPaid) {
    return (
      <p
        role="status"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-money-in-border bg-money-in-soft text-body font-semibold text-money-in-soft-foreground"
      >
        <CircleCheck aria-hidden className="size-5" /> Cuenta pagada · ¡gracias!
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <ServiceButton
        call={calls.find((c) => c.type === "WAITER")}
        icon={<Bell />}
        cooldownLeft={waiterLeft}
        idleLabel="Llamar mesero"
        pendingLabel="Mesero avisado"
        acceptedLabel="Mesero en camino"
        staleLabel="Volver a llamar"
        confirmTitle="¿Llamar al mesero?"
        confirmDescription={`Un mesero irá a la Mesa ${tableNumber}.`}
        confirmLabel="Llamar"
        onConfirm={() => callWaiter("WAITER")}
      />
      <ServiceButton
        call={calls.find((c) => c.type === "BILL")}
        icon={<Receipt />}
        cooldownLeft={billLeft}
        requested={billRequested}
        idleLabel="Pedir cuenta"
        pendingLabel="Cuenta pedida"
        acceptedLabel="Cuenta en camino"
        staleLabel="Pedirla de nuevo"
        confirmTitle="¿Solicitar la cuenta?"
        confirmDescription={`El mesero llevará la cuenta a la Mesa ${tableNumber}.`}
        confirmLabel="Solicitar"
        onConfirm={() => callWaiter("BILL")}
        // Sin pedidos no hay cuenta que pedir. La base lo rechaza igual,
        // pero un botón que falla al tocarlo es peor que uno que avisa
        // antes: al mesero le ahorraba un viaje en balde, y al cliente
        // le explica qué le falta en vez de darle un error.
        blocked={!hasAnyOrder}
        blockedLabel="Pide algo primero"
      />
    </div>
  );
}

function ServiceButton({
  call,
  icon,
  idleLabel,
  pendingLabel,
  acceptedLabel,
  staleLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  onConfirm,
  blocked = false,
  blockedLabel,
  cooldownLeft = 0,
  requested = false,
}: {
  call: SessionCall | undefined;
  icon: React.ReactNode;
  idleLabel: string;
  pendingLabel: string;
  acceptedLabel: string;
  /** Tras 5 min sin atender. Tiene que decir QUÉ se vuelve a pedir: con
   *  un "Volver a llamar" idéntico en los dos botones, el cliente no
   *  sabe cuál es cuál. */
  staleLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  onConfirm: () => ReturnType<typeof callWaiter>;
  /** La acción todavía no corresponde. Distinto de "en espera": ahí ya
   *  la pediste; aquí aún no puedes. */
  blocked?: boolean;
  blockedLabel?: string;
  /** Segundos de espera antes de poder repetir la misma llamada. */
  cooldownLeft?: number;
  /** Ya se pidió y quedó atendida: no se vuelve a ofrecer. */
  requested?: boolean;
}) {
  const stale = usePastDeadline(
    call?.status === "PENDING"
      ? new Date(call.created_at).getTime() + REOPEN_AFTER_MS
      : null
  );

  const cooling = cooldownLeft > 0 && !requested && call === undefined;
  const waiting = (call !== undefined && !stale) || requested;
  const label = blocked
    ? (blockedLabel ?? idleLabel)
    : requested && call === undefined
      ? pendingLabel
      : cooling
        ? `${idleLabel} · ${formatCountdown(cooldownLeft)}`
        : !waiting
      ? stale
        ? staleLabel
        : idleLabel
      : call!.status === "ACCEPTED"
        ? acceptedLabel
        : pendingLabel;

  // Each state has its own tone AND its own icon, so the customer never
  // has to read color alone: waiting = amber clock, on the way = green
  // check, insist again = amber outline, blocked/cooldown = muted.
  const accepted = !blocked && waiting && call?.status === "ACCEPTED";
  const shownIcon = blocked || cooling
    ? icon
    : accepted
      ? <CircleCheck />
      : waiting
        ? <Clock />
        : icon;
  const trigger = (
    <Button
      variant="ghost"
      disabled={waiting || blocked || cooling}
      className={cn(
        "h-12 min-w-0 rounded-2xl border px-3 text-body-sm font-semibold sm:text-body [&_svg]:size-[18px]",
        blocked && "border-border bg-secondary text-muted-foreground disabled:opacity-100",
        !blocked &&
          waiting &&
          !accepted &&
          "border-attention-border bg-attention-soft text-attention-soft-foreground disabled:opacity-100",
        accepted &&
          "border-money-in-border bg-money-in-soft text-money-in-soft-foreground disabled:opacity-100",
        !blocked &&
          cooling &&
          "border-border bg-secondary text-muted-foreground disabled:opacity-100",
        !blocked &&
          !waiting &&
          !cooling &&
          !stale &&
          "border-border bg-card text-foreground hover:bg-secondary [&_svg]:text-primary",
        !blocked &&
          !waiting &&
          stale &&
          "border-attention bg-card text-foreground hover:bg-secondary [&_svg]:text-attention-soft-foreground"
      )}
    >
      {shownIcon} <span className="truncate">{label}</span>
    </Button>
  );

  if (waiting || blocked || cooling) return trigger;

  return (
    <ConfirmDialog
      trigger={trigger}
      title={confirmTitle}
      description={confirmDescription}
      confirmLabel={confirmLabel}
      action={onConfirm}
      onSuccess={() => notify.callAcknowledged()}
    />
  );
}
