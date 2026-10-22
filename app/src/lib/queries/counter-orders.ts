import { createClient } from "@/lib/supabase/server";
import type {
  CounterOrderView,
  CounterServiceType,
  DeliveryProvider,
} from "@/lib/counter-order";

/** Pedidos de mostrador recientes (M06), con los datos de entrega. */
export async function getCounterOrders(restaurantId: string, limit = 30): Promise<CounterOrderView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, folio, service_type, status, created_at, customer_name, delivery_provider, external_order_id, general_comment, shipping_cost, subtotal, total, preferred_payment_method, pays_with_amount, table_session_id, order_items(product_name, quantity, subtotal, notes)"
    )
    .eq("restaurant_id", restaurantId)
    .in("service_type", ["dine_in_no_table", "takeaway", "delivery"])
    .eq("cancelled", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    folio: o.folio,
    serviceType: o.service_type as CounterServiceType,
    status: o.status,
    createdAt: o.created_at,
    customerName: o.customer_name,
    // PII: se obtiene bajo demanda con getOrderContact (get_order_contact).
    customerPhone: null,
    deliveryProvider: o.delivery_provider as DeliveryProvider | null,
    externalOrderId: o.external_order_id,
    deliveryAddress: null,
    generalComment: o.general_comment,
    shippingCost: o.shipping_cost === null ? null : Number(o.shipping_cost),
    subtotal: Number(o.subtotal),
    total: Number(o.total),
    preferredPaymentMethod: o.preferred_payment_method,
    paysWithAmount: o.pays_with_amount === null ? null : Number(o.pays_with_amount),
    tableSessionId: o.table_session_id,
    items: (o.order_items ?? []).map((i) => ({
      name: i.product_name,
      quantity: i.quantity,
      subtotal: Number(i.subtotal),
      notes: i.notes,
    })),
  }));
}
