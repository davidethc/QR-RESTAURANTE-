import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  DigitalMenu,
  DigitalMenuSettings,
  DigitalMenuStatus,
  OnlineOrder,
  OnlinePaymentMethod,
  OnlineServiceType,
  StaffOnlineOrder,
} from "@/types/digital-menu";

/**
 * M12 reads. The public ones use the anon client (no cookies) and are NOT
 * cached: pause/resume and opening hours must show up on the next load.
 */

export async function getDigitalMenu(slug: string): Promise<DigitalMenu | null> {
  const { data, error } = await createPublicClient().rpc("get_digital_menu", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as DigitalMenu;
}

export async function getPublicOnlineOrder(token: string): Promise<OnlineOrder | null> {
  const { data, error } = await createPublicClient().rpc("get_online_order", { p_token: token });
  if (error || !data) return null;
  return data as unknown as OnlineOrder;
}

export async function getDigitalMenuSettings(restaurantId: string): Promise<DigitalMenuSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_digital_menu_settings", { p_restaurant_id: restaurantId });
  if (error) throw error;
  return data as unknown as DigitalMenuSettings;
}

export async function getDigitalMenuStatus(restaurantId: string): Promise<DigitalMenuStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("digital_menu_status")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error || !data) return null;
  return data.digital_menu_status as DigitalMenuStatus;
}

export async function canHandleOnlineOrders(restaurantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_handle_online_orders", { p_restaurant_id: restaurantId });
  return !error && data === true;
}

/**
 * Web orders still waiting for Aceptar/Rechazar. Phone and address are not
 * selectable by `authenticated`; the panel asks `get_order_contact` on demand.
 */
export async function getPendingOnlineOrders(restaurantId: string): Promise<StaffOnlineOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, folio, short_code, service_type, status, status_review, created_at, confirmed_at, expires_at, customer_name, preferred_payment_method, pays_with_amount, general_comment, shipping_cost, subtotal, total, order_items(product_name, quantity, subtotal, notes, cancelled, created_at)"
    )
    .eq("restaurant_id", restaurantId)
    .eq("source", "web")
    .eq("status", "PENDING")
    .eq("cancelled", false)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;

  return (data ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    folio: o.folio,
    shortCode: o.short_code,
    serviceType: o.service_type as OnlineServiceType,
    status: o.status,
    statusReview: o.status_review,
    createdAt: o.created_at,
    confirmedAt: o.confirmed_at,
    expiresAt: o.expires_at,
    customerName: o.customer_name,
    preferredPaymentMethod: o.preferred_payment_method as OnlinePaymentMethod | null,
    paysWithAmount: o.pays_with_amount === null ? null : Number(o.pays_with_amount),
    generalComment: o.general_comment,
    shippingCost: o.shipping_cost === null ? null : Number(o.shipping_cost),
    subtotal: Number(o.subtotal),
    total: Number(o.total),
    items: [...(o.order_items ?? [])]
      .filter((i) => !i.cancelled)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((i) => ({
        name: i.product_name,
        // order_items.variant_name has no column grant for `authenticated` (DB gap).
        variantName: null,
        quantity: i.quantity,
        subtotal: Number(i.subtotal),
        notes: i.notes,
      })),
  }));
}
