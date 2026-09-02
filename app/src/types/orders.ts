import type { OrderStatus, CallType, CallStatus } from "@/config/constants";

export interface Order {
  id: string;
  order_number: number;
  restaurant_id: string;
  table_id: string;
  table_session_id: string | null;
  status: OrderStatus;
  subtotal: number;
  total: number;
  notes: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  created_at: string;
}

export interface OrderItemOption {
  id: string;
  order_item_id: string;
  option_name: string;
  value_name: string;
  price_modifier: number;
  created_at: string;
}

export interface SessionCall {
  id: string;
  type: CallType;
  status: CallStatus;
  created_at: string;
}

export interface WaiterCall {
  id: string;
  restaurant_id: string;
  table_id: string;
  table_session_id: string | null;
  type: CallType;
  status: CallStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
}
