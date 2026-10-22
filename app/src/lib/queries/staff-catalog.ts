import { createClient } from "@/lib/supabase/server";
import type { StaffModifierGroup, StaffProductDetail } from "@/types/menu";

/**
 * Variantes y personalizaciones de la carta, para el selector del mesero.
 * `get_public_menu` no las trae; se leen con la sesión del personal (la RLS
 * de lectura es por membresía, así que sirve también a meseros).
 */
export async function getStaffProductDetails(
  restaurantId: string
): Promise<Record<string, StaffProductDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, product_variants(id, name, price, position), product_modifier_groups(position, modifier_groups(id, name, min_select, max_select, allow_repeat, modifier_options(id, name, price, position)))"
    )
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (error) throw error;

  const out: Record<string, StaffProductDetail> = {};
  for (const p of data ?? []) {
    const variants = [...(p.product_variants ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ id, name, price }) => ({ id, name, price: Number(price) }));
    const groups: StaffModifierGroup[] = [...(p.product_modifier_groups ?? [])]
      .sort((a, b) => a.position - b.position)
      .flatMap((link) => {
        const g = Array.isArray(link.modifier_groups)
          ? link.modifier_groups[0]
          : link.modifier_groups;
        if (!g) return [];
        return [
          {
            id: g.id,
            name: g.name,
            min_select: g.min_select,
            max_select: g.max_select,
            allow_repeat: g.allow_repeat,
            options: [...(g.modifier_options ?? [])]
              .sort((a, b) => a.position - b.position)
              .map((o) => ({ id: o.id, name: o.name, price: Number(o.price) })),
          },
        ];
      });
    out[p.id] = { variants, groups };
  }
  return out;
}

export interface TicketItemView {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  notes: string | null;
  cancelled: boolean;
  unitPrice: number;
}

export interface TicketView {
  id: string;
  number: number;
  createdAt: string;
  authorName: string | null;
  items: TicketItemView[];
}

export interface ActiveOrderView {
  id: string;
  folio: number;
  tickets: TicketView[];
}

/** Pedido vigente de la mesa (sesión activa, no cancelado) con sus comandas. */
export async function getActiveOrderForTable(
  tableId: string
): Promise<ActiveOrderView | null> {
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, folio, table_sessions!inner(status)")
    .eq("table_id", tableId)
    .eq("cancelled", false)
    .eq("table_sessions.status", "ACTIVE")
    .not("status", "in", "(REJECTED,CANCELLED)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const { data: tickets, error: tErr } = await supabase
    .from("tickets")
    .select("id, number, created_at, created_by")
    .eq("order_id", order.id)
    .order("number");
  if (tErr) throw tErr;
  const { data: lines, error: lErr } = await supabase
    .from("order_items")
    .select(
      "id, ticket_id, product_id, product_name, quantity, notes, cancelled, unit_price"
    )
    .eq("order_id", order.id)
    .order("created_at");
  if (lErr) throw lErr;

  const authorIds = [
    ...new Set((tickets ?? []).map((t) => t.created_by).filter(Boolean)),
  ] as string[];
  const names = new Map<string, string | null>();
  if (authorIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name);
  }

  return {
    id: order.id,
    folio: order.folio,
    tickets: (tickets ?? []).map((t) => ({
      id: t.id,
      number: t.number,
      createdAt: t.created_at,
      authorName: t.created_by ? (names.get(t.created_by) ?? null) : null,
      items: (lines ?? [])
        .filter((i) => i.ticket_id === t.id)
        .map((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        quantity: i.quantity,
        notes: i.notes,
        cancelled: i.cancelled,
        unitPrice: Number(i.unit_price),
      })),
    })),
  };
}
