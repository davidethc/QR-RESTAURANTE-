"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bluetooth, ChefHat, Loader2, Receipt, Save, Usb } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { toneSoft } from "@/components/shared/pos-tone";
import { CustomerTicket } from "@/components/print/customer-ticket";
import { KitchenPrintTicket } from "@/components/print/kitchen-ticket";
import { SAMPLE_KITCHEN_TICKET, SAMPLE_TICKET_BILL } from "@/components/print/sample-data";
import { SettingsCard, SettingRow } from "../../_components/settings-card";
import { savePrintingSettings } from "@/lib/actions/printing";
import { notify } from "@/lib/notifications";
import { FONT_SIZE_OPTIONS, PRINT_TEXT_MAX, isDraftDirty, toDraft, validateDraft } from "@/lib/printing";
import { cn } from "@/lib/utils";
import type { PrintFontSize, PrintingDraft, PrintingSettings } from "@/types/printing";

type Preview = "customer" | "kitchen";

export function PrintingForm({ restaurantId, settings }: { restaurantId: string; settings: PrintingSettings }) {
  const router = useRouter();
  const [saved, setSaved] = useState<PrintingDraft>(() => toDraft(settings));
  const [draft, setDraft] = useState<PrintingDraft>(saved);
  const [preview, setPreview] = useState<Preview>("customer");
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const headerId = useId();
  const footerId = useId();

  const dirty = isDraftDirty(saved, draft);
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Warn before leaving with unsaved changes: browser close/reload…
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
    }
    // …and in-app links (the sidebar), which never trigger beforeunload.
    function onClick(e: MouseEvent) {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(anchor.pathname + anchor.search);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  function set<K extends keyof PrintingDraft>(key: K, value: PrintingDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
    if (errors) return;
    startTransition(async () => {
      const result = await savePrintingSettings({ restaurantId, ...draft });
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      const next = { ...draft, customer_ticket_header: draft.customer_ticket_header.trim(), customer_ticket_footer: draft.customer_ticket_footer.trim() };
      setSaved(next);
      setDraft(next);
      notify.success("Impresión guardada");
      router.refresh();
    });
  }

  const liveSettings = {
    ...settings,
    customer_ticket_font_size: draft.customer_ticket_font_size,
    customer_ticket_header: draft.customer_ticket_header,
    customer_ticket_footer: draft.customer_ticket_footer,
  };

  const sizeOptions = FONT_SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

  return (
    <div className="grid items-start gap-4 px-4 pb-10 pt-4 md:px-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex flex-col gap-4">
        <SettingsCard
          id="print-customer"
          title="Ticket del cliente"
          help="Lo que recibe el cliente al pagar. El logo sale de los datos del negocio."
          icon={Receipt}
          tone="info"
        >
          <SettingRow title="Tamaño de letra" help="Chica entra más en menos papel.">
            <SegmentedControl
              aria-label="Tamaño de letra del ticket del cliente"
              options={sizeOptions}
              value={draft.customer_ticket_font_size}
              onValueChange={(v: PrintFontSize) => set("customer_ticket_font_size", v)}
              size="md"
            />
          </SettingRow>
          <TextField
            id={headerId}
            title="Encabezado"
            help="Aparece debajo del nombre del negocio."
            value={draft.customer_ticket_header}
            error={errors?.customer_ticket_header}
            onChange={(v) => set("customer_ticket_header", v)}
            placeholder="Ej. Cafetería y desayunos"
          />
          <TextField
            id={footerId}
            title="Pie de página"
            help="Al final del ticket. Sin texto, se imprime “¡Gracias por su visita!”."
            value={draft.customer_ticket_footer}
            error={errors?.customer_ticket_footer}
            onChange={(v) => set("customer_ticket_footer", v)}
            placeholder="Ej. Síguenos en @micafeteria"
          />
        </SettingsCard>

        <SettingsCard
          id="print-kitchen"
          title="Comanda de cocina y barra"
          help="Se imprime desde cada comanda del tablero de cocina."
          icon={ChefHat}
          tone="attention"
        >
          <SettingRow title="Tamaño de letra" help="La comanda se lee de lejos: Grande es lo habitual.">
            <SegmentedControl
              aria-label="Tamaño de letra de la comanda"
              options={sizeOptions}
              value={draft.kitchen_ticket_font_size}
              onValueChange={(v: PrintFontSize) => set("kitchen_ticket_font_size", v)}
              size="md"
            />
          </SettingRow>
        </SettingsCard>

        <SettingsCard
          id="print-advanced"
          title="Impresión avanzada"
          help="Impresora Bluetooth o USB, e impresión automática sin diálogo al entrar un pedido."
          icon={Usb}
          tone="neutral"
          aside={
            <span className={cn("rounded-full border px-3 py-1 text-caption font-semibold", toneSoft.neutral)}>Próximamente</span>
          }
        >
          <div aria-disabled className="flex flex-wrap gap-2 opacity-60">
            <span className="flex min-h-12 items-center gap-2 rounded-control border border-border px-4 text-body-sm font-medium">
              <Bluetooth aria-hidden className="size-4" /> Bluetooth
            </span>
            <span className="flex min-h-12 items-center gap-2 rounded-control border border-border px-4 text-body-sm font-medium">
              <Usb aria-hidden className="size-4" /> Cable USB
            </span>
          </div>
          <p className="text-meta text-muted-foreground">
            Mientras tanto, se imprime con el diálogo del navegador desde el botón “Imprimir”.
          </p>
        </SettingsCard>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-sm">
          <p role="status" className={cn("mr-auto text-body-sm", dirty ? "font-semibold text-attention" : "text-muted-foreground")}>
            {dirty ? "Hay cambios sin guardar" : "Todo guardado"}
          </p>
          {dirty && (
            <Button type="button" variant="outline" className="min-h-12" disabled={isPending} onClick={() => setDraft(saved)}>
              Descartar
            </Button>
          )}
          <Button type="button" className="min-h-12 px-6 font-semibold" disabled={!dirty || isPending || errors !== null} onClick={save}>
            {isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      <aside aria-label="Vista previa" className="flex flex-col gap-3 xl:sticky xl:top-4">
        <SegmentedControl
          aria-label="Vista previa de"
          options={[
            { value: "customer" as const, label: "Ticket del cliente" },
            { value: "kitchen" as const, label: "Comanda" },
          ]}
          value={preview}
          onValueChange={setPreview}
          size="md"
        />
        <div className="rounded-card border border-border bg-secondary/40 p-4">
          <div className="mx-auto w-full max-w-[320px]">
            {preview === "customer" ? (
              <CustomerTicket settings={liveSettings} bill={SAMPLE_TICKET_BILL} />
            ) : (
              <KitchenPrintTicket
                ticket={SAMPLE_KITCHEN_TICKET}
                fontSize={draft.kitchen_ticket_font_size}
                timeZone={settings.restaurant.timezone}
              />
            )}
          </div>
        </div>
        <p className="text-meta text-muted-foreground">Vista previa con datos de ejemplo. El papel real mide 80 mm.</p>
      </aside>

      <AlertDialog open={pendingHref !== null} onOpenChange={(open) => !open && setPendingHref(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>Los cambios de impresión que hiciste se perderán.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const href = pendingHref;
                dirtyRef.current = false;
                setPendingHref(null);
                if (href) router.push(href);
              }}
            >
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TextField({
  id,
  title,
  help,
  value,
  error,
  onChange,
  placeholder,
}: {
  id: string;
  title: string;
  help: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-body-sm font-semibold text-foreground">
        {title}
      </label>
      <p className="text-meta leading-snug text-muted-foreground">{help}</p>
      <Textarea
        id={id}
        value={value}
        rows={2}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-count`}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-16 text-body"
      />
      <p id={`${id}-count`} className={cn("text-caption tabular-nums", error ? "font-semibold text-destructive" : "text-muted-foreground")}>
        {error ?? `${value.trim().length}/${PRINT_TEXT_MAX}`}
      </p>
    </div>
  );
}
