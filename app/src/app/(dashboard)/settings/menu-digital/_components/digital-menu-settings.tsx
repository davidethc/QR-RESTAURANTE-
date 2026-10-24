"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Banknote,
  Bike,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Globe,
  Landmark,
  Loader2,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Rocket,
  Store,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ChoiceCards } from "@/components/shared/choice-card";
import { CopyLinkField } from "@/components/shared/copy-link-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import { posPressable } from "@/components/shared/pos-tone";
import { notify } from "@/lib/notifications";
import { getSiteOrigin } from "@/lib/qr";
import {
  activateDigitalMenu,
  pauseDigitalMenu,
  resumeDigitalMenu,
  saveDeliverySettings,
  savePaymentMethodSettings,
  setDigitalMenuWhatsapp,
} from "@/lib/actions/digital-menu";
import { PAUSE_PRESETS, SERVICE_LABELS, VOLUME_LABELS, businessAutoReply, parseMoneyInput } from "@/lib/digital-menu";
import { cn, formatPrice } from "@/lib/utils";
import type { ActionResult } from "@/types/actions";
import type { DigitalMenuSettings, OnlineServiceType, PausePreset, WhatsappVolume } from "@/types/digital-menu";
import { SettingRow, SettingsCard } from "../../_components/settings-card";

type Saver = (fn: () => Promise<ActionResult<DigitalMenuSettings>>, success: string) => Promise<boolean>;

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function DigitalMenuSettingsView({
  restaurantId,
  restaurantName,
  initialSettings,
}: {
  restaurantId: string;
  restaurantName: string;
  initialSettings: DigitalMenuSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window origin is client-only
    setOrigin(getSiteOrigin());
  }, []);
  const menuUrl = `${origin}/pedir/${settings.slug}`;

  const save: Saver = async (fn, success) => {
    const r = await fn();
    if (!r.ok) {
      notify.error(r.error);
      return false;
    }
    setSettings(r.data);
    notify.success(success);
    return true;
  };

  if (settings.digital_menu_status === "inactive") {
    return <ActivationWizard restaurantId={restaurantId} settings={settings} menuUrl={menuUrl} save={save} />;
  }

  const paused = settings.state.status === "paused";
  const scheduled = settings.digital_menu_status === "paused" && !paused;
  return (
    <>
      <section
        aria-label="Estado del menú digital"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <StatusPill
          tone={paused ? "attention" : "money-in"}
          icon={paused ? PauseCircle : Globe}
          title={paused ? "Pedidos en línea en pausa" : "Recibiendo pedidos en línea"}
          detail={
            paused
              ? settings.paused_until
                ? `Hasta ${formatWhen(settings.paused_until)}`
                : "Hasta que lo reactives"
              : settings.state.accepting_orders
                ? "Mesas y POS siguen igual"
                : "Fuera de horario ahora"
          }
        />
        <div className="flex flex-wrap items-stretch gap-2 sm:border-l sm:border-border sm:pl-4">
          <StatusMetric
            label="Domicilio"
            value={`${settings.delivery.delivery_time_min}–${settings.delivery.delivery_time_max} min`}
            tone="info"
            icon={Bike}
          />
          <StatusMetric label="Recoger" value={`${settings.delivery.pickup_time} min`} tone="info" icon={Store} />
          <StatusMetric
            label="Envío"
            value={settings.delivery.free_shipping_enabled ? `Gratis desde ${formatPrice(settings.delivery.free_shipping_min_amount ?? 0)}` : "Por cotizar"}
            tone="neutral"
            icon={Wallet}
          />
        </div>
      </section>

      <div className="grid items-start gap-4 px-4 pb-10 pt-4 md:px-5 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <PauseCard restaurantId={restaurantId} settings={settings} paused={paused} scheduled={scheduled} save={save} />
          <ShareCard menuUrl={menuUrl} restaurantName={restaurantName} />
          <WhatsappCard restaurantId={restaurantId} settings={settings} save={save} />
        </div>
        <div className="flex flex-col gap-4">
          <DeliveryCard restaurantId={restaurantId} settings={settings} save={save} />
          <PaymentsCard restaurantId={restaurantId} settings={settings} save={save} />
        </div>
      </div>
    </>
  );
}

// ───────────────────────────── Wizard ─────────────────────────────

function ActivationWizard({
  restaurantId,
  settings,
  menuUrl,
  save,
}: {
  restaurantId: string;
  settings: DigitalMenuSettings;
  menuUrl: string;
  save: Saver;
}) {
  const [step, setStep] = useState<1 | 2>(settings.whatsapp_number ? 2 : 1);
  const [number, setNumber] = useState(settings.whatsapp_number ?? "");
  const [volume, setVolume] = useState<WhatsappVolume | null>(settings.whatsapp_monthly_volume);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 pt-4 md:px-5">
      <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-5">
        <h2 className="text-title-sm font-semibold text-foreground">Recibe pedidos a domicilio y para recoger</h2>
        <p className="text-body text-muted-foreground">
          Tus clientes piden desde un enlace con tu menú. Cada pedido llega a Pedidos › En línea y, si el cliente lo
          envía, también a tu WhatsApp. Tú lo aceptas y pasa a cocina.
        </p>
        <ol className="mt-2 grid grid-cols-2 gap-2" aria-label="Pasos">
          {["WhatsApp", "Activar"].map((label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-control border px-3 text-body-sm font-semibold",
                step === i + 1 ? "border-foreground text-foreground" : step > i + 1 ? "border-money-in-border bg-money-in-soft text-money-in-soft-foreground" : "border-border text-muted-foreground"
              )}
            >
              {step > i + 1 ? <CheckCircle2 aria-hidden className="size-4" /> : <span className="tabular-nums">{i + 1}.</span>}
              {label}
            </li>
          ))}
        </ol>
      </section>

      {step === 1 ? (
        <SettingsCard
          id="wizard-whatsapp"
          title="Número de WhatsApp para recibir pedidos"
          help="Aquí te llegan los mensajes de los pedidos. Escríbelo con código de país."
          icon={MessageCircle}
          tone="money-in"
          footer={
            <Button
              type="button"
              disabled={pending}
              className="h-12 px-5"
              onClick={() =>
                startTransition(async () => {
                  const ok = await save(
                    () => setDigitalMenuWhatsapp({ restaurantId, number, volume: volume ?? undefined }),
                    "WhatsApp vinculado"
                  );
                  if (ok) setStep(2);
                })
              }
            >
              {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Continuar
            </Button>
          }
        >
          <SettingRow title="Número" htmlFor="wa-number" help="Ejemplo: +593 99 123 4567">
            <Input id="wa-number" value={number} onChange={(e) => setNumber(e.target.value)} type="tel" className="h-12 w-60" />
          </SettingRow>
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-semibold text-foreground">¿Cuántos pedidos a domicilio recibes al mes?</p>
            <p className="text-meta text-muted-foreground">Aproximado, sin contar apps de reparto.</p>
            <ChoiceCards<WhatsappVolume>
              label="Pedidos al mes"
              columns={4}
              size="md"
              value={volume}
              onChange={setVolume}
              options={(Object.keys(VOLUME_LABELS) as WhatsappVolume[]).map((v) => ({
                value: v,
                title: VOLUME_LABELS[v],
                icon: Bike,
                tone: "info",
              }))}
            />
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard
          id="wizard-activate"
          title="Tu enlace de menú digital"
          help="Compártelo en redes, en tu WhatsApp Business o imprímelo en QR."
          icon={Rocket}
          tone="money-in"
          footer={
            <>
              <Button type="button" variant="outline" className="h-12" onClick={() => setStep(1)} disabled={pending}>
                Cambiar WhatsApp
              </Button>
              <Button
                type="button"
                disabled={pending}
                className="h-12 bg-money-in px-5 text-money-in-foreground hover:bg-money-in/90"
                onClick={() =>
                  startTransition(async () => {
                    await save(() => activateDigitalMenu(restaurantId), "Menú digital activado");
                  })
                }
              >
                {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Rocket aria-hidden className="size-4" />}
                Activar menú digital
              </Button>
            </>
          }
        >
          <CopyLinkField url={menuUrl} label="enlace del menú digital" />
          <p className="text-meta text-muted-foreground">
            Los pedidos llegarán al número {settings.whatsapp_number}. Puedes pausarlo o cambiar envíos y pagos cuando quieras.
          </p>
        </SettingsCard>
      )}
    </div>
  );
}

// ───────────────────────────── Pause ─────────────────────────────

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function PauseCard({
  restaurantId,
  settings,
  paused,
  scheduled,
  save,
}: {
  restaurantId: string;
  settings: DigitalMenuSettings;
  paused: boolean;
  scheduled: boolean;
  save: Saver;
}) {
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");

  function pause(preset: PausePreset) {
    startTransition(async () => {
      await save(
        () =>
          pauseDigitalMenu({
            restaurantId,
            preset,
            ...(preset === "custom" ? { from: toIso(from), until: toIso(until) } : {}),
          }),
        "Pedidos en línea en pausa"
      );
      setCustom(false);
    });
  }

  return (
    <SettingsCard
      id="dm-pause"
      title={paused ? "En pausa" : scheduled ? "Pausa programada" : "Pausar pedidos en línea"}
      help="Mientras está en pausa los clientes ven el menú pero no pueden pedir. Mesas y POS siguen funcionando."
      icon={paused ? PauseCircle : Clock}
      tone={paused || scheduled ? "attention" : "neutral"}
      aside={pending ? <Loader2 aria-label="Guardando" className="size-5 animate-spin text-muted-foreground" /> : null}
    >
      {paused || scheduled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-attention-border bg-attention-soft px-3 py-2.5">
          <p className="text-body-sm font-semibold text-attention-soft-foreground">
            {scheduled && settings.paused_from ? `Pausa desde ${formatWhen(settings.paused_from)} ` : "Pausado "}
            {settings.paused_until ? `hasta ${formatWhen(settings.paused_until)}` : "hasta que lo reactives"}
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => void (await save(() => resumeDigitalMenu(restaurantId), "Pedidos en línea reactivados")))}
            className="h-12 bg-money-in text-money-in-foreground hover:bg-money-in/90"
          >
            <PlayCircle aria-hidden className="size-4" /> Reactivar ahora
          </Button>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Pausar por" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAUSE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                disabled={pending}
                onClick={() => pause(p.value)}
                className={cn(posPressable, "min-h-12 rounded-button border border-border bg-card px-3 text-body-sm font-semibold hover:bg-muted")}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              aria-expanded={custom}
              onClick={() => setCustom((c) => !c)}
              className={cn(posPressable, "min-h-12 rounded-button border px-3 text-body-sm font-semibold", custom ? "border-foreground" : "border-border hover:bg-muted")}
            >
              Personalizada
            </button>
          </div>
          {custom && (
            <div className="grid gap-3 rounded-control border border-border bg-secondary/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-body-sm font-semibold">
                Desde (vacío = ahora)
                <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12" />
              </label>
              <label className="flex flex-col gap-1 text-body-sm font-semibold">
                Hasta
                <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="h-12" />
              </label>
              <Button type="button" disabled={pending || !until} onClick={() => pause("custom")} className="h-12">
                Pausar
              </Button>
            </div>
          )}
        </>
      )}
    </SettingsCard>
  );
}

// ───────────────────────────── Share ─────────────────────────────

function ShareCard({ menuUrl, restaurantName }: { menuUrl: string; restaurantName: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!menuUrl.startsWith("http")) return;
    let alive = true;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(menuUrl, { width: 512, margin: 2 }))
      .then((png) => alive && setQr(png))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [menuUrl]);
  const autoReply = businessAutoReply(restaurantName, menuUrl);

  return (
    <SettingsCard id="dm-share" title="Enlace del menú" help="Compártelo para que te pidan a domicilio o para recoger." icon={Globe} tone="info">
      <CopyLinkField url={menuUrl} label="enlace del menú digital" />
      <div className="flex flex-wrap items-center gap-3">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser
          <img src={qr} alt="Código QR del menú digital" className="size-28 rounded-control border border-border bg-white p-1" />
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-12">
            <a href={menuUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden className="size-4" /> Ver menú
            </a>
          </Button>
          {qr && (
            <Button asChild variant="outline" className="h-12">
              <a href={qr} download="menu-digital-qr.png">
                <Download aria-hidden className="size-4" /> Descargar QR
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-body-sm font-semibold text-foreground">Mensaje automático para WhatsApp Business</p>
        <p className="text-meta text-muted-foreground">Ponlo como respuesta de bienvenida: el cliente pide solo y tú lo preparas más rápido.</p>
        <CopyLinkField url={autoReply} label="mensaje automático" />
      </div>
    </SettingsCard>
  );
}

// ───────────────────────────── WhatsApp ─────────────────────────────

function WhatsappCard({ restaurantId, settings, save }: { restaurantId: string; settings: DigitalMenuSettings; save: Saver }) {
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(settings.whatsapp_number ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <SettingsCard
      id="dm-whatsapp"
      title="WhatsApp vinculado"
      help="A este número llegan los mensajes de los pedidos del menú digital."
      icon={MessageCircle}
      tone="money-in"
    >
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-body-sm font-semibold">
            Número nuevo
            <Input value={number} onChange={(e) => setNumber(e.target.value)} type="tel" placeholder="+593 99 123 4567" className="h-12" />
          </label>
          <Button type="button" variant="outline" className="h-12" onClick={() => setEditing(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-12"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (await save(() => setDigitalMenuWhatsapp({ restaurantId, number }), "Número actualizado")) setEditing(false);
              })
            }
          >
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Guardar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-title-sm font-bold tabular-nums">{settings.whatsapp_number ?? "Sin número"}</p>
          <Button type="button" variant="outline" className="h-12" onClick={() => setEditing(true)}>
            Cambiar número
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

// ───────────────────────────── Delivery ─────────────────────────────

function numText(n: number | null | undefined) {
  return n === null || n === undefined ? "" : String(n);
}

function DeliveryCard({ restaurantId, settings, save }: { restaurantId: string; settings: DigitalMenuSettings; save: Saver }) {
  const d = settings.delivery;
  const [freeOn, setFreeOn] = useState(d.free_shipping_enabled);
  const [freeMin, setFreeMin] = useState(numText(d.free_shipping_min_amount));
  const [minOn, setMinOn] = useState(d.min_purchase_enabled);
  const [minAmount, setMinAmount] = useState(numText(d.min_purchase_amount));
  const [tMin, setTMin] = useState(String(d.delivery_time_min));
  const [tMax, setTMax] = useState(String(d.delivery_time_max));
  const [tPickup, setTPickup] = useState(String(d.pickup_time));
  const [ttl, setTtl] = useState(String(d.unconfirmed_ttl_minutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const money = (v: string) => {
      const n = parseMoneyInput(v);
      return n === null || Number.isNaN(n) ? null : n;
    };
    startTransition(async () => {
      const r = await saveDeliverySettings(restaurantId, {
        free_shipping_enabled: freeOn,
        free_shipping_min_amount: money(freeMin),
        min_purchase_enabled: minOn,
        min_purchase_amount: money(minAmount),
        delivery_time_min: Number(tMin),
        delivery_time_max: Number(tMax),
        pickup_time: Number(tPickup),
        unconfirmed_ttl_minutes: Number(ttl),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await save(async () => r, "Envíos y tiempos guardados");
    });
  }

  const minutesInput = (id: string, value: string, set: (v: string) => void) => (
    <span className="flex items-center gap-2">
      <Input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode="numeric" className="h-12 w-24 text-right tabular-nums" />
      <span className="text-body-sm text-muted-foreground">min</span>
    </span>
  );

  return (
    <SettingsCard
      id="dm-delivery"
      title="Envíos y tiempos"
      help="Lo que ve el cliente al elegir A domicilio o Para recoger. Los tiempos cuentan desde que hace el pedido."
      icon={Bike}
      tone="info"
      footer={
        <>
          {error && <p role="alert" className="mr-auto text-body-sm font-semibold text-money-out-soft-foreground">{error}</p>}
          <Button type="button" onClick={submit} disabled={pending} className="h-12 px-5">
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Guardar
          </Button>
        </>
      }
    >
      <SettingRow title="Domicilio: tiempo estimado" help="Mínimo y máximo">
        {minutesInput("t-min", tMin, setTMin)}
        <span className="text-muted-foreground">–</span>
        {minutesInput("t-max", tMax, setTMax)}
      </SettingRow>
      <SettingRow title="Para recoger: listo en" htmlFor="t-pickup">
        {minutesInput("t-pickup", tPickup, setTPickup)}
      </SettingRow>
      <SettingRow title="Costo de envío" help="Por ahora lo cotizas tú y lo sumas al aceptar el pedido.">
        <span className="rounded-full border border-border bg-secondary px-3 py-1 text-body-sm font-semibold">Por cotizar</span>
      </SettingRow>
      <SettingRow title="Envío gratis" help="Desde un monto de compra (productos).">
        <Switch checked={freeOn} onCheckedChange={setFreeOn} aria-label="Envío gratis" />
        {freeOn && (
          <Input value={freeMin} onChange={(e) => setFreeMin(e.target.value)} inputMode="decimal" placeholder="$ 20" aria-label="Envío gratis desde" className="h-12 w-28 text-right tabular-nums" />
        )}
      </SettingRow>
      <SettingRow title="Compra mínima a domicilio" help="Debajo de este monto no se puede pedir a domicilio.">
        <Switch checked={minOn} onCheckedChange={setMinOn} aria-label="Compra mínima" />
        {minOn && (
          <Input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} inputMode="decimal" placeholder="$ 10" aria-label="Compra mínima" className="h-12 w-28 text-right tabular-nums" />
        )}
      </SettingRow>
      <SettingRow title="Vencer pedidos sin confirmar" htmlFor="t-ttl" help="Si el cliente no lo confirma en este tiempo, se cancela solo.">
        {minutesInput("t-ttl", ttl, setTtl)}
      </SettingRow>
    </SettingsCard>
  );
}

// ───────────────────────────── Payments ─────────────────────────────

function PaymentsCard({ restaurantId, settings, save }: { restaurantId: string; settings: DigitalMenuSettings; save: Saver }) {
  const [channel, setChannel] = useState<OnlineServiceType>("delivery");
  return (
    <SettingsCard
      id="dm-payments"
      title="Métodos de pago"
      help="Cómo te pueden pagar en cada tipo de pedido. Con transferencia, el cliente ve tus datos bancarios."
      icon={Wallet}
      tone="money-in"
      aside={
        <SegmentedControl<OnlineServiceType>
          aria-label="Tipo de pedido"
          value={channel}
          onValueChange={setChannel}
          options={[
            { value: "delivery", label: SERVICE_LABELS.delivery, icon: Bike },
            { value: "pickup", label: SERVICE_LABELS.pickup, icon: Store },
          ]}
        />
      }
    >
      <PaymentChannelForm key={channel} restaurantId={restaurantId} channel={channel} settings={settings} save={save} />
    </SettingsCard>
  );
}

function PaymentChannelForm({
  restaurantId,
  channel,
  settings,
  save,
}: {
  restaurantId: string;
  channel: OnlineServiceType;
  settings: DigitalMenuSettings;
  save: Saver;
}) {
  const pm = settings.payment_methods[channel];
  const [cash, setCash] = useState(pm.cash);
  const [card, setCard] = useState(pm.card);
  const [transfer, setTransfer] = useState(pm.transfer);
  const [holder, setHolder] = useState(pm.bank?.holder ?? "");
  const [bank, setBank] = useState(pm.bank?.bank ?? "");
  const [account, setAccount] = useState(pm.bank?.account ?? "");
  const [cardNumber, setCardNumber] = useState(pm.bank?.card_number ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await savePaymentMethodSettings(restaurantId, channel, {
        cash_enabled: cash,
        card_enabled: card,
        transfer_enabled: transfer,
        bank_holder: holder,
        bank_name: bank,
        bank_account: account,
        bank_card_number: cardNumber,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await save(async () => r, `Pagos de ${SERVICE_LABELS[channel].toLowerCase()} guardados`);
    });
  }

  const row = (label: string, icon: typeof Banknote, checked: boolean, set: (v: boolean) => void) => {
    const Icon = icon;
    return (
      <SettingRow title={label}>
        <Icon aria-hidden className="size-5 text-muted-foreground" />
        <Switch checked={checked} onCheckedChange={set} aria-label={label} />
      </SettingRow>
    );
  };

  return (
    <>
      {row("Efectivo", Banknote, cash, setCash)}
      {row("Tarjeta", CreditCard, card, setCard)}
      {row("Transferencia", Landmark, transfer, setTransfer)}
      {transfer && (
        <div className="grid gap-3 rounded-control border border-border bg-secondary/40 p-3 sm:grid-cols-2">
          <BankInput label="Titular" value={holder} onChange={setHolder} max={80} />
          <BankInput label="Banco" value={bank} onChange={setBank} max={80} />
          <BankInput label="Número de cuenta" value={account} onChange={setAccount} max={40} />
          <BankInput label="Número de tarjeta (opcional)" value={cardNumber} onChange={setCardNumber} max={25} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
        {error && <p role="alert" className="mr-auto text-body-sm font-semibold text-money-out-soft-foreground">{error}</p>}
        <Button type="button" onClick={submit} disabled={pending} className="h-12 px-5">
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />} Guardar
        </Button>
      </div>
    </>
  );
}

function BankInput({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max: number }) {
  return (
    <label className="flex flex-col gap-1 text-body-sm font-semibold">
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} className="h-12" />
    </label>
  );
}
