import type {
  OrderStatus,
  CallType,
  CallStatus,
  TableStatus,
  UserRole,
  MemberStatus,
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
  accepted_by_name: string | null;
  items: StaffOrderItem[];
}

export interface SessionOrderItemSummary {
  product_name: string;
  quantity: number;
  subtotal: number;
}

export interface StaffWaiterCall {
  id: string;
  type: CallType;
  status: CallStatus;
  created_at: string;
  handled_at: string | null;
  table_number: number;
  table_name: string | null;
  handled_by_name: string | null;
  session_total: number;
  session_items: SessionOrderItemSummary[];
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

export interface StaffMember {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: MemberStatus;
  created_at: string;
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
}
