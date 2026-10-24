"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarX2, CircleCheck, Gift, Pause, Pencil, Percent, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { posPressable, toneBar, toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { deletePromotion } from "@/lib/actions/promotions";
import {
  PROMOTION_TYPE_LABEL,
  activationSummary,
  promotionDisplayStatus,
  promotionLabel,
} from "@/lib/promotions";
import { cn, normalizeText } from "@/lib/utils";
import type { AdminCategory, AdminProduct } from "@/types/staff";
import type { Promotion, PromotionDisplayStatus } from "@/types/promotions";
import { PromoChip } from "../../cash/_components/checkout/promo-line";
import { PromotionEditor } from "./promotion-editor";

const STATUS: Record<PromotionDisplayStatus, { label: string; tone: PosTone; icon: LucideIcon }> = {
  today: { label: "Activa hoy", tone: "money-in", icon: CircleCheck },
  scheduled: { label: "Programada", tone: "info", icon: CalendarClock },
  expired: { label: "Vencida", tone: "neutral", icon: CalendarX2 },
  paused: { label: "Pausada", tone: "attention", icon: Pause },
};
const ORDER: PromotionDisplayStatus[] = ["today", "scheduled", "paused", "expired"];

/**
 * Promociones tab of Carta: search, one card per promotion with its status
 * ("Activa hoy" is computed with the restaurant's local date), edit in the
 * full-panel editor and delete with an explicit confirmation.
 */
export function PromotionsBoard({
  restaurantId,
  promotions,
  categories,
  products,
  today,
}: {
  restaurantId: string;
  promotions: Promotion[];
  categories: AdminCategory[];
  products: AdminProduct[];
  today: { date: string; weekday: number };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const term = normalizeText(query.trim());
    return promotions
      .map((p) => ({ p, status: promotionDisplayStatus(p, today) }))
      .filter(({ p }) => !term || normalizeText(p.name).includes(term))
      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  }, [promotions, query, today]);

  const counts = useMemo(() => {
    const c: Record<PromotionDisplayStatus, number> = { today: 0, scheduled: 0, expired: 0, paused: 0 };
    for (const p of promotions) c[promotionDisplayStatus(p, today)] += 1;
    return c;
  }, [promotions, today]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [categories, products]);

  const newButton = (
    <PromotionEditor
      restaurantId={restaurantId}
      categories={categories}
      products={products}
      today={today.date}
      trigger={
        <button
          type="button"
          className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button bg-foreground px-4 text-body-sm font-semibold text-background hover:bg-foreground/90")}
        >
          <Plus className="size-4" aria-hidden /> Nueva promoción
        </button>
      }
    />
  );

  if (promotions.length === 0) {
    return (
      <section aria-label="Promociones" className="flex flex-col items-center gap-4 rounded-card border-2 border-dashed border-border bg-card px-6 py-12 text-center">
        <span className={cn("flex size-14 items-center justify-center rounded-full border", toneSoft.attention)}>
          <Tag className="size-6" aria-hidden />
        </span>
        <div className="max-w-md">
          <h2 className="text-lead font-semibold text-foreground">Crea tu primera promoción</h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Un descuento o un 2x1 en los días flojos atrae clientes. Se aplica solo en los pedidos y se ve en la carta.
          </p>
        </div>
        <div className="grid w-full max-w-xl gap-3 text-left sm:grid-cols-2">
          <Hint icon={Percent} tone="attention" title="Descuento en productos" text="Un porcentaje o un monto menos en productos o categorías." />
          <Hint icon={Gift} tone="info" title="Compra X y lleva Y" text="Estilo 2x1 o 3x2, por días de la semana." />
        </div>
        {newButton}
      </section>
    );
  }

  return (
    <section aria-label="Promociones" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-60 md:max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar promoción…"
            aria-label="Buscar promoción"
            className="h-12 rounded-full pr-10 pl-9 text-body"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Resumen">
          {ORDER.filter((s) => counts[s] > 0).map((s) => (
            <li key={s}>
              <StatusChip status={s} count={counts[s]} />
            </li>
          ))}
        </ul>
        <div className="ml-auto">{newButton}</div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
          Ninguna promoción coincide con “{query}”.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map(({ p, status }) => {
            const targets = p.target_ids.map((id) => names.get(id)).filter(Boolean) as string[];
            return (
              <li key={p.id} className="relative flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-card p-4 pl-5 shadow-sm">
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", toneBar[STATUS[status].tone])} />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="wrap-anywhere text-body font-semibold leading-tight text-foreground">{p.name}</h3>
                    <p className="mt-0.5 text-meta text-muted-foreground">{PROMOTION_TYPE_LABEL[p.type]}</p>
                  </div>
                  <StatusChip status={status} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PromoChip label={promotionLabel(p)} className="text-body-sm" />
                  <span className="text-body-sm text-foreground">{activationSummary(p)}</span>
                </div>
                <p className="line-clamp-2 text-meta text-muted-foreground">
                  {p.applies_to === "categories" ? "Categorías: " : "Productos: "}
                  {targets.length ? targets.join(", ") : `${p.target_ids.length} elegidos`}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                  <PromotionEditor
                    restaurantId={restaurantId}
                    categories={categories}
                    products={products}
                    promotion={p}
                    today={today.date}
                    trigger={
                      <button
                        type="button"
                        className={cn(posPressable, "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold text-foreground hover:border-border-strong")}
                      >
                        <Pencil className="size-4" aria-hidden /> Editar
                      </button>
                    }
                  />
                  <ConfirmDialog
                    title={`¿Borrar “${p.name}”?`}
                    description="Esta acción no se puede deshacer. Deja de aplicarse a los pedidos nuevos al instante; los pedidos ya hechos conservan su precio."
                    confirmLabel="Borrar promoción"
                    destructive
                    action={() => deletePromotion(p.id)}
                    successMessage="Promoción borrada"
                    onSuccess={() => router.refresh()}
                    trigger={
                      <button
                        type="button"
                        aria-label={`Borrar ${p.name}`}
                        className={cn(posPressable, "flex min-h-12 items-center justify-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold text-money-out-soft-foreground hover:border-money-out-border")}
                      >
                        <Trash2 className="size-4" aria-hidden /> Borrar
                      </button>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusChip({ status, count }: { status: PromotionDisplayStatus; count?: number }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-caption font-semibold", toneSoft[s.tone])}>
      <s.icon className="size-3.5" aria-hidden /> {s.label}
      {count != null && <span className="tabular-nums">· {count}</span>}
    </span>
  );
}

function Hint({ icon: Icon, tone, title, text }: { icon: LucideIcon; tone: PosTone; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-card border border-border bg-background p-3">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-control border", toneSoft[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold text-foreground">{title}</span>
        <span className="block text-meta leading-snug text-muted-foreground">{text}</span>
      </span>
    </div>
  );
}
