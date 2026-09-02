import type {
  RestaurantStatus,
  MemberStatus,
  UserRole,
  TableStatus,
  TableSessionStatus,
} from "@/config/constants";

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  phone: string | null;
  address: string | null;
  status: RestaurantStatus;
  timezone: string;
  opening_hours: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface RestaurantMember {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: UserRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: string;
  restaurant_id: string;
  number: number;
  name: string | null;
  status: TableStatus;
  qr_token: string;
  created_at: string;
  updated_at: string;
}

export interface TableSession {
  id: string;
  restaurant_id: string;
  table_id: string;
  session_token: string;
  status: TableSessionStatus;
  started_at: string;
  last_activity_at: string;
  closed_at: string | null;
}

export interface ResolvedTableQr {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  table_id: string;
  table_number: number;
  session_token: string;
}
