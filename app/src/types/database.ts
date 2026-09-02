// Generado desde Supabase. Regenerar tras cambios de esquema:
// npx supabase gen types typescript --project-id fvzxfbzujvkkvniyphps > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          restaurant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          restaurant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          restaurant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          created_at: string
          id: string
          option_name: string
          order_item_id: string
          price_modifier: number
          value_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_name: string
          order_item_id: string
          price_modifier?: number
          value_name: string
        }
        Update: {
          created_at?: string
          id?: string
          option_name?: string
          order_item_id?: string
          price_modifier?: number
          value_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: number
          preparing_at: string | null
          ready_at: string | null
          rejection_reason: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string
          table_session_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_number?: never
          preparing_at?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id: string
          table_session_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_number?: never
          preparing_at?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string
          table_session_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          position: number
          price_modifier: number
          product_option_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          position?: number
          price_modifier?: number
          product_option_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          position?: number
          price_modifier?: number
          product_option_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_product_option_id_fkey"
            columns: ["product_option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          position: number
          product_id: string
          required: boolean
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          position?: number
          product_id: string
          required?: boolean
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          position?: number
          product_id?: string
          required?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          available: boolean
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          position: number
          price: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          position?: number
          price: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          position?: number
          price?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_members: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          opening_hours: Json | null
          phone: string | null
          slug: string
          status: Database["public"]["Enums"]["restaurant_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          opening_hours?: Json | null
          phone?: string | null
          slug: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          id: string
          last_activity_at: string
          restaurant_id: string
          session_token: string
          started_at: string
          status: Database["public"]["Enums"]["table_session_status"]
          table_id: string
        }
        Insert: {
          closed_at?: string | null
          id?: string
          last_activity_at?: string
          restaurant_id: string
          session_token?: string
          started_at?: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id: string
        }
        Update: {
          closed_at?: string | null
          id?: string
          last_activity_at?: string
          restaurant_id?: string
          session_token?: string
          started_at?: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          created_at: string
          id: string
          name: string | null
          number: number
          qr_token: string
          restaurant_id: string
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          number: number
          qr_token?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          number?: number
          qr_token?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_calls: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["waiter_call_status"]
          table_id: string
          table_session_id: string | null
          type: Database["public"]["Enums"]["waiter_call_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["waiter_call_status"]
          table_id: string
          table_session_id?: string | null
          type: Database["public"]["Enums"]["waiter_call_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["waiter_call_status"]
          table_id?: string
          table_session_id?: string | null
          type?: Database["public"]["Enums"]["waiter_call_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_calls_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_order: { Args: { p_order_id: string }; Returns: undefined }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      get_public_menu: { Args: { p_slug: string }; Returns: Json }
      create_customer_order: {
        Args: { p_items: Json; p_notes?: string; p_session_token: string }
        Returns: string
      }
      create_waiter_call: {
        Args: {
          p_session_token: string
          p_type: Database["public"]["Enums"]["waiter_call_type"]
        }
        Returns: string
      }
      get_customer_order: {
        Args: { p_order_id: string; p_session_token: string }
        Returns: Json
      }
      get_session_orders: { Args: { p_session_token: string }; Returns: Json }
      get_my_restaurant: { Args: Record<string, never>; Returns: Json }
      get_staff_orders: {
        Args: {
          p_restaurant_id: string
          p_statuses?: Database["public"]["Enums"]["order_status"][]
          p_limit?: number
        }
        Returns: Json
      }
      get_waiter_calls: {
        Args: {
          p_restaurant_id: string
          p_statuses?: Database["public"]["Enums"]["waiter_call_status"][]
        }
        Returns: Json
      }
      get_dashboard_summary: { Args: { p_restaurant_id: string }; Returns: Json }
      get_tables_status: { Args: { p_restaurant_id: string }; Returns: Json }
      get_admin_menu: { Args: { p_restaurant_id: string }; Returns: Json }
      get_staff_members: { Args: { p_restaurant_id: string }; Returns: Json }
      close_table_session: { Args: { p_table_id: string }; Returns: undefined }
      handle_waiter_call: {
        Args: {
          p_call_id: string
          p_status: Database["public"]["Enums"]["waiter_call_status"]
        }
        Returns: undefined
      }
      mark_order_delivered: { Args: { p_order_id: string }; Returns: undefined }
      mark_order_ready: { Args: { p_order_id: string }; Returns: undefined }
      reject_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      resolve_table_qr: {
        Args: { p_qr_token: string }
        Returns: {
          restaurant_id: string
          restaurant_name: string
          restaurant_slug: string
          session_token: string
          table_id: string
          table_number: number
        }[]
      }
      start_order_preparing: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      user_belongs_to_restaurant: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      user_has_restaurant_role: {
        Args: {
          target_restaurant_id: string
          target_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      audit_action:
        | "CREATE"
        | "UPDATE"
        | "DELETE"
        | "LOGIN"
        | "LOGOUT"
        | "ACCEPT_ORDER"
        | "REJECT_ORDER"
        | "START_PREPARING"
        | "MARK_ORDER_READY"
        | "MARK_ORDER_DELIVERED"
        | "CREATE_WAITER_CALL"
        | "HANDLE_WAITER_CALL"
      member_role: "OWNER" | "ADMIN" | "WAITER" | "KITCHEN"
      member_status: "ACTIVE" | "INACTIVE"
      order_status:
        | "PENDING"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "DELIVERED"
        | "REJECTED"
        | "CANCELLED"
      restaurant_status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
      table_session_status: "ACTIVE" | "CLOSED" | "EXPIRED"
      table_status:
        | "AVAILABLE"
        | "OCCUPIED"
        | "ATTENTION"
        | "BILL_REQUESTED"
        | "INACTIVE"
      waiter_call_status:
        | "PENDING"
        | "ACCEPTED"
        | "ATTENDED"
        | "REJECTED"
        | "CANCELLED"
      waiter_call_type: "WAITER" | "BILL"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "LOGIN",
        "LOGOUT",
        "ACCEPT_ORDER",
        "REJECT_ORDER",
        "START_PREPARING",
        "MARK_ORDER_READY",
        "MARK_ORDER_DELIVERED",
        "CREATE_WAITER_CALL",
        "HANDLE_WAITER_CALL",
      ],
      member_role: ["OWNER", "ADMIN", "WAITER", "KITCHEN"],
      member_status: ["ACTIVE", "INACTIVE"],
      order_status: [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "DELIVERED",
        "REJECTED",
        "CANCELLED",
      ],
      restaurant_status: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      table_session_status: ["ACTIVE", "CLOSED", "EXPIRED"],
      table_status: [
        "AVAILABLE",
        "OCCUPIED",
        "ATTENTION",
        "BILL_REQUESTED",
        "INACTIVE",
      ],
      waiter_call_status: [
        "PENDING",
        "ACCEPTED",
        "ATTENDED",
        "REJECTED",
        "CANCELLED",
      ],
      waiter_call_type: ["WAITER", "BILL"],
    },
  },
} as const
