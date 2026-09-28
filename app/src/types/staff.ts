import type {
  OrderStatus,
  CallType,
  CallStatus,
  TableStatus,
  UserRole,
  MemberStatus,
  TableKind,
  PaymentMethod,
} from "@/config/constants";

/* Lo que devuelven los RPC del panel. Cada uno es una sola llamada
   que trae todo lo que su pantalla necesita pintar. */

export interface MyRestaurant {
  user: { id: string; full_name: string | null; avatar_url: string | null };
  role: UserRole;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    timezone: string;
  };
}

export interface StaffOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
}

export interface StaffOrder {
  id: string;
  order_number: number;
  status: OrderStatus;
  subtotal: number;
  total: number;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  table_number: number;
  table_name: string | null;
  /** Venta de mostrador (C3): "Para llevar #N" en vez de mesa. */
  table_kind: TableKind;
  counter_number: number | null;
  customer_label: string | null;
  place_label: string;
  accepted_by_name: string | null;
  items: StaffOrderItem[];
}

export interface SessionOrderItemSummary {
  product_name: string;
  quantity: number;
  subtotal: number;
}

export interface SessionOrderGroup {
  order_number: number;
  created_at: string;
  subtotal: number;
  items: SessionOrderItemSummary[];
}

export interface StaffWaiterCall {
  id: string;
  type: CallType;
  status: CallStatus;
  created_at: string;
  handled_at: string | null;
  /** Para saltar de la solicitud directo a tomarle el pedido a esa mesa. */
  table_id: string;
  table_number: number;
  table_name: string | null;
  handled_by_name: string | null;
  session_total: number;
  session_orders: SessionOrderGroup[];
}

export interface DashboardSummary {
  pending_orders: number;
  accepted_orders: number;
  preparing_orders: number;
  ready_orders: number;
  pending_calls: number;
  occupied_tables: number;
  total_tables: number;
  orders_today: number;
  revenue_today: number;
}

export interface TableStatusRow {
  id: string;
  number: number;
  name: string | null;
  status: TableStatus;
  qr_token: string;
  active_orders: number;
  pending_calls: number;
  active_total: number;
}

/** La mesa a la que el mesero le va a tomar el pedido. */
export interface TableForOrder {
  id: string;
  number: number;
  name: string | null;
  restaurant_id: string;
  status: TableStatus;
}

/** Lo más vendido, para el acceso rápido de la pantalla de pedido. */
export interface TopProduct {
  id: string;
  name: string;
  price: number;
}

export interface AdminCategory {
  id: string;
  name: string;
  description: string | null;
  position: number;
  active: boolean;
  product_count: number;
}

export interface AdminProduct {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  available: boolean;
  featured: boolean;
  paired_drink_id: string | null;
  position: number;
}

export interface AdminMenu {
  categories: AdminCategory[];
  products: AdminProduct[];
}

/* Lo que ve el cliente sobre su propio pedido */

export interface CustomerOrder {
  id: string;
  order_number: number;
  status: OrderStatus;
  subtotal: number;
  total: number;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  table_number: number;
  /** Hoy `get_customer_order` no lo devuelve (los pedidos QR siempre son de
   *  mesa); si algún día lo hace, el seguimiento dice "Pasa a recoger". */
  table_kind?: TableKind;
  items: StaffOrderItem[];
}

export interface SessionOrderSummary {
  id: string;
  order_number: number;
  status: OrderStatus;
  total: number;
  rejection_reason: string | null;
  created_at: string;
  item_count: number;
}

export interface RestaurantSettings {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  /** Módulo de cobro (M5). Columna ya existe en restaurants; RLS la deja
   *  leer a cualquier miembro (restaurants_select_members). */
  billing_enabled: boolean;
  /** Tope de descuento que puede aplicar un WAITER sin ser OWNER/ADMIN. */
  max_waiter_discount_pct: number;
  /** Hora local ("HH:MM:SS") en que cierra el día de negocio para reportes. */
  business_day_cutoff: string;
  /** Zona horaria IANA del restaurante (ej. "America/Guayaquil"). La usa
   *  el ticket imprimible para mostrar la fecha/hora local, no la del
   *  servidor. */
  timezone: string;
  /** true = la cocina marca "Listo" (columna "Para recoger", pestaña
   *  "Listos" del mesero). false = la cocina solo mira: nunca hay pedidos
   *  en READY y `mark_order_ready` queda reservada a OWNER/ADMIN. */
  kitchen_ready_step: boolean;
}

/** Una persona del personal, como la devuelve `get_restaurant_staff`. */
export interface StaffMember {
  member_id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  status: MemberStatus;
  created_at: string;
  is_me: boolean;
  /** Quien mira puede cambiarle rol, estado o clave. */
  can_manage: boolean;
}

/** Lo que devuelve `get_sales_report`. Montos en dólares. */
export interface SalesReport {
  /** "bills": cuentas cobradas en Caja. "orders": pedidos entregados (sin cobro activo). */
  source: "bills" | "orders";
  days: 1 | 7 | 30;
  from: string;
  to: string;
  summary: {
    total_sold: number;
    tickets: number;
    avg_ticket: number;
    discounts: number;
    tips: number;
  };
  by_day: { date: string; total: number }[];
  by_method: { method: PaymentMethod; total: number }[];
  top_products: { name: string; quantity: number; total: number }[];
  /** Cuentas abiertas ahora mismo (solo con cobro activo). */
  open_bills: { count: number; total: number } | null;
}
