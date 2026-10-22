export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
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
      availability: {
        Row: {
          available: boolean
          group_id: string | null
          item_id: string
          item_type: string
          product_id: string | null
          restaurant_id: string
        }
        Insert: {
          available?: boolean
          group_id?: string | null
          item_id: string
          item_type: string
          product_id?: string | null
          restaurant_id: string
        }
        Update: {
          available?: boolean
          group_id?: string | null
          item_id?: string
          item_type?: string
          product_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_modifier_group_restaurant_fkey"
            columns: ["group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "availability_modifier_option_fkey"
            columns: ["item_id", "group_id"]
            isOneToOne: false
            referencedRelation: "modifier_options"
            referencedColumns: ["id", "group_id"]
          },
          {
            foreignKeyName: "availability_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_variant_fkey"
            columns: ["item_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "availability_variant_restaurant_fkey"
            columns: ["product_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      bill_discounts: {
        Row: {
          amount: number
          applied_at: string
          applied_by: string | null
          bill_id: string
          id: string
          kind: Database["public"]["Enums"]["discount_kind"]
          order_item_id: string | null
          reason: string
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          restaurant_id: string
          value: number
        }
        Insert: {
          amount?: number
          applied_at?: string
          applied_by?: string | null
          bill_id: string
          id?: string
          kind: Database["public"]["Enums"]["discount_kind"]
          order_item_id?: string | null
          reason: string
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          restaurant_id: string
          value: number
        }
        Update: {
          amount?: number
          applied_at?: string
          applied_by?: string | null
          bill_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["discount_kind"]
          order_item_id?: string | null
          reason?: string
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          restaurant_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_discounts_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_discounts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_discounts_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_discounts_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_discounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          balance: number
          bill_number: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          discount_total: number
          id: string
          invoice_id: string | null
          opened_at: string
          opened_by: string | null
          paid_at: string | null
          paid_total: number
          restaurant_id: string
          split_mode: Database["public"]["Enums"]["bill_split_mode"]
          split_parts: number
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          table_id: string
          table_session_id: string
          tip_total: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          balance?: number
          bill_number?: never
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          discount_total?: number
          id?: string
          invoice_id?: string | null
          opened_at?: string
          opened_by?: string | null
          paid_at?: string | null
          paid_total?: number
          restaurant_id: string
          split_mode?: Database["public"]["Enums"]["bill_split_mode"]
          split_parts?: number
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          table_id: string
          table_session_id: string
          tip_total?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          balance?: number
          bill_number?: never
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          discount_total?: number
          id?: string
          invoice_id?: string | null
          opened_at?: string
          opened_by?: string | null
          paid_at?: string | null
          paid_total?: number
          restaurant_id?: string
          split_mode?: Database["public"]["Enums"]["bill_split_mode"]
          split_parts?: number
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          table_id?: string
          table_session_id?: string
          tip_total?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          cash_session_id: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_id: string | null
          id: string
          idempotency_key: string
          purchase_id: string | null
          reason: Database["public"]["Enums"]["cash_movement_reason"]
          restaurant_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
          number: number | null
        }
        Insert: {
          amount: number
          cash_session_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_id?: string | null
          id?: string
          idempotency_key: string
          purchase_id?: string | null
          reason: Database["public"]["Enums"]["cash_movement_reason"]
          restaurant_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
          number?: number | null
        }
        Update: {
          amount?: number
          cash_session_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_id?: string | null
          id?: string
          idempotency_key?: string
          purchase_id?: string | null
          reason?: Database["public"]["Enums"]["cash_movement_reason"]
          restaurant_id?: string
          type?: Database["public"]["Enums"]["cash_movement_type"]
          number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_session_counts: {
        Row: {
          cash_session_id: string
          counted: number | null
          difference: number | null
          expected: number
          method: Database["public"]["Enums"]["payment_method"]
          restaurant_id: string
        }
        Insert: {
          cash_session_id: string
          counted?: number | null
          difference?: number | null
          expected: number
          method: Database["public"]["Enums"]["payment_method"]
          restaurant_id: string
        }
        Update: {
          cash_session_id?: string
          counted?: number | null
          difference?: number | null
          expected?: number
          method?: Database["public"]["Enums"]["payment_method"]
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_session_counts_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_session_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float: number
          register_id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["cash_session_status"]
          updated_at: string
          cash_float_left: number | null
          cash_to_withdraw: number | null
          cut_number: number | null
          result: string | null
          skipped_order_folios: number[]
          skipped_pending_orders: boolean
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          register_id: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["cash_session_status"]
          updated_at?: string
          cash_float_left?: number | null
          cash_to_withdraw?: number | null
          cut_number?: number | null
          result?: string | null
          skipped_order_folios?: number[]
          skipped_pending_orders?: boolean
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          register_id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["cash_session_status"]
          updated_at?: string
          cash_float_left?: number | null
          cash_to_withdraw?: number | null
          cut_number?: number | null
          result?: string | null
          skipped_order_folios?: number[]
          skipped_pending_orders?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          schedule_ids: string[]
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
          schedule_ids?: string[]
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
          schedule_ids?: string[]
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
      modifier_groups: {
        Row: {
          allow_repeat: boolean
          created_at: string
          id: string
          internal_label: string | null
          legacy_option_id: string | null
          max_select: number
          min_select: number
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          allow_repeat?: boolean
          created_at?: string
          id?: string
          internal_label?: string | null
          legacy_option_id?: string | null
          max_select?: number
          min_select?: number
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          allow_repeat?: boolean
          created_at?: string
          id?: string
          internal_label?: string | null
          legacy_option_id?: string | null
          max_select?: number
          min_select?: number
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_legacy_option_id_fkey"
            columns: ["legacy_option_id"]
            isOneToOne: true
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          legacy_value_id: string | null
          name: string
          position: number
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          legacy_value_id?: string | null
          name: string
          position?: number
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          legacy_value_id?: string | null
          name?: string
          position?: number
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_options_legacy_value_id_fkey"
            columns: ["legacy_value_id"]
            isOneToOne: true
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
        ]
      }
      order_counters: {
        Row: {
          last_folio: number
          restaurant_id: string
        }
        Insert: {
          last_folio?: number
          restaurant_id: string
        }
        Update: {
          last_folio?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          created_at: string
          id: string
          modifier_option_id: string | null
          option_name: string
          order_item_id: string
          price_modifier: number
          qty: number
          value_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          modifier_option_id?: string | null
          option_name: string
          order_item_id: string
          price_modifier?: number
          qty?: number
          value_name: string
        }
        Update: {
          created_at?: string
          id?: string
          modifier_option_id?: string | null
          option_name?: string
          order_item_id?: string
          price_modifier?: number
          qty?: number
          value_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_modifier_option_id_fkey"
            columns: ["modifier_option_id"]
            isOneToOne: false
            referencedRelation: "modifier_options"
            referencedColumns: ["id"]
          },
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
          cancelled: boolean
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          subtotal: number
          ticket_id: string | null
          unit_cost: number | null
          unit_price: number
          variant_id: string | null
          variant_name: string | null
          variant_price: number | null
        }
        Insert: {
          cancelled?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          subtotal: number
          ticket_id?: string | null
          unit_cost?: number | null
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
          variant_price?: number | null
        }
        Update: {
          cancelled?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          subtotal?: number
          ticket_id?: string | null
          unit_cost?: number | null
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
          variant_price?: number | null
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
          {
            foreignKeyName: "order_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          cancel_reason: string | null
          cancelled: boolean
          cancelled_by: string | null
          client_request_id: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: Json | null
          delivery_provider: string | null
          external_order_id: string | null
          folio: number
          general_comment: string | null
          id: string
          notes: string | null
          order_number: number
          pays_with_amount: number | null
          preferred_payment_method: string | null
          preparing_at: string | null
          ready_at: string | null
          rejection_reason: string | null
          restaurant_id: string
          service_type: string
          shipping_cost: number | null
          short_code: string
          status: Database["public"]["Enums"]["order_status"]
          status_review: string
          subtotal: number
          table_id: string
          table_session_id: string | null
          total: number
          updated_at: string
          source: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          cancel_reason?: string | null
          cancelled?: boolean
          cancelled_by?: string | null
          client_request_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_provider?: string | null
          external_order_id?: string | null
          folio: number
          general_comment?: string | null
          id?: string
          notes?: string | null
          order_number?: never
          pays_with_amount?: number | null
          preferred_payment_method?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          service_type?: string
          shipping_cost?: number | null
          short_code: string
          status?: Database["public"]["Enums"]["order_status"]
          status_review?: string
          subtotal?: number
          table_id: string
          table_session_id?: string | null
          total?: number
          updated_at?: string
          source?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          cancel_reason?: string | null
          cancelled?: boolean
          cancelled_by?: string | null
          client_request_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_provider?: string | null
          external_order_id?: string | null
          folio?: number
          general_comment?: string | null
          id?: string
          notes?: string | null
          order_number?: never
          pays_with_amount?: number | null
          preferred_payment_method?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          service_type?: string
          shipping_cost?: number | null
          short_code?: string
          status?: Database["public"]["Enums"]["order_status"]
          status_review?: string
          subtotal?: number
          table_id?: string
          table_session_id?: string | null
          total?: number
          updated_at?: string
          source?: string | null
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
      payment_items: {
        Row: {
          order_item_id: string
          payment_id: string
          quantity: number
          restaurant_id: string
        }
        Insert: {
          order_item_id: string
          payment_id: string
          quantity: number
          restaurant_id: string
        }
        Update: {
          order_item_id?: string
          payment_id?: string
          quantity?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bill_id: string
          card_type: string | null
          cash_register_id: string | null
          cash_session_id: string
          change_amount: number | null
          created_at: string
          id: string
          idempotency_key: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          number: number | null
          received_at: string
          received_by: string | null
          reference: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["payment_status"]
          tendered_amount: number | null
          tip_amount: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          card_type?: string | null
          cash_register_id?: string | null
          cash_session_id: string
          change_amount?: number | null
          created_at?: string
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          number?: number | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          tendered_amount?: number | null
          tip_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          card_type?: string | null
          cash_register_id?: string | null
          cash_session_id?: string
          change_amount?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          number?: number | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          tendered_amount?: number | null
          tip_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_login_attempts: {
        Row: {
          failed_count: number
          hard_locked: boolean
          lock_count: number
          locked_until: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          failed_count?: number
          hard_locked?: boolean
          lock_count?: number
          locked_until?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          failed_count?: number
          hard_locked?: boolean
          lock_count?: number
          locked_until?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_login_attempts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifier_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          position: number
          product_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          position?: number
          product_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      product_variants: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          price: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
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
          featured: boolean
          id: string
          image_url: string | null
          name: string
          paired_drink_id: string | null
          position: number
          price: number
          restaurant_id: string
          service_options: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          name: string
          paired_drink_id?: string | null
          position?: number
          price: number
          restaurant_id: string
          service_options?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          name?: string
          paired_drink_id?: string | null
          position?: number
          price?: number
          restaurant_id?: string
          service_options?: Json
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
            foreignKeyName: "products_paired_drink_id_fkey"
            columns: ["paired_drink_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          cash_register_ids: string[]
          created_at: string
          email_login_enabled: boolean
          id: string
          pin_hash: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          roles: string[]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_register_ids?: string[]
          created_at?: string
          email_login_enabled?: boolean
          id?: string
          pin_hash?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["member_role"]
          roles?: string[]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_register_ids?: string[]
          created_at?: string
          email_login_enabled?: boolean
          id?: string
          pin_hash?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          roles?: string[]
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
          billing_enabled: boolean
          business_day_cutoff: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          kds_alert_minutes: number
          kds_enabled: boolean
          kds_warn_minutes: number
          kitchen_ready_step: boolean
          logo_url: string | null
          max_waiter_discount_pct: number
          name: string
          opening_hours: Json | null
          phone: string | null
          slug: string
          status: Database["public"]["Enums"]["restaurant_status"]
          timezone: string
          updated_at: string
          qr_call_cooldown_seconds: number
          qr_orders_require_approval: boolean
        }
        Insert: {
          address?: string | null
          billing_enabled?: boolean
          business_day_cutoff?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kds_alert_minutes?: number
          kds_enabled?: boolean
          kds_warn_minutes?: number
          kitchen_ready_step?: boolean
          logo_url?: string | null
          max_waiter_discount_pct?: number
          name: string
          opening_hours?: Json | null
          phone?: string | null
          slug: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          timezone?: string
          updated_at?: string
          qr_call_cooldown_seconds?: number
          qr_orders_require_approval?: boolean
        }
        Update: {
          address?: string | null
          billing_enabled?: boolean
          business_day_cutoff?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kds_alert_minutes?: number
          kds_enabled?: boolean
          kds_warn_minutes?: number
          kitchen_ready_step?: boolean
          logo_url?: string | null
          max_waiter_discount_pct?: number
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          timezone?: string
          updated_at?: string
          qr_call_cooldown_seconds?: number
          qr_orders_require_approval?: boolean
        }
        Relationships: []
      }
      schedule_shifts: {
        Row: {
          ends_at: string
          id: string
          schedule_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          ends_at: string
          id?: string
          schedule_id: string
          starts_at: string
          weekday: number
        }
        Update: {
          ends_at?: string
          id?: string
          schedule_id?: string
          starts_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          client_request_id: string | null
          closed_at: string | null
          counter_number: number | null
          customer_label: string | null
          id: string
          last_activity_at: string
          restaurant_id: string
          session_token: string
          started_at: string
          status: Database["public"]["Enums"]["table_session_status"]
          table_id: string
          table_kind: Database["public"]["Enums"]["table_kind"]
        }
        Insert: {
          client_request_id?: string | null
          closed_at?: string | null
          counter_number?: number | null
          customer_label?: string | null
          id?: string
          last_activity_at?: string
          restaurant_id: string
          session_token?: string
          started_at?: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id: string
          table_kind?: Database["public"]["Enums"]["table_kind"]
        }
        Update: {
          client_request_id?: string | null
          closed_at?: string | null
          counter_number?: number | null
          customer_label?: string | null
          id?: string
          last_activity_at?: string
          restaurant_id?: string
          session_token?: string
          started_at?: string
          status?: Database["public"]["Enums"]["table_session_status"]
          table_id?: string
          table_kind?: Database["public"]["Enums"]["table_kind"]
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
          {
            foreignKeyName: "table_sessions_table_kind_fkey"
            columns: ["table_id", "table_kind"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      tables: {
        Row: {
          col: number | null
          created_at: string
          height_cells: number
          id: string
          kind: Database["public"]["Enums"]["table_kind"]
          name: string | null
          number: number
          qr_token: string
          restaurant_id: string
          row: number | null
          shape: string
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
          width_cells: number
          zone_id: string | null
        }
        Insert: {
          col?: number | null
          created_at?: string
          height_cells?: number
          id?: string
          kind?: Database["public"]["Enums"]["table_kind"]
          name?: string | null
          number: number
          qr_token?: string
          restaurant_id: string
          row?: number | null
          shape?: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
          width_cells?: number
          zone_id?: string | null
        }
        Update: {
          col?: number | null
          created_at?: string
          height_cells?: number
          id?: string
          kind?: Database["public"]["Enums"]["table_kind"]
          name?: string | null
          number?: number
          qr_token?: string
          restaurant_id?: string
          row?: number | null
          shape?: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
          width_cells?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_zone_restaurant_fkey"
            columns: ["zone_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      tickets: {
        Row: {
          client_request_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_new: boolean
          kitchen_status: string
          number: number
          order_id: string
          restaurant_id: string
        }
        Insert: {
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_new?: boolean
          kitchen_status?: string
          number: number
          order_id: string
          restaurant_id?: string
        }
        Update: {
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_new?: boolean
          kitchen_status?: string
          number?: number
          order_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      zones: {
        Row: {
          created_at: string
          grid_cols: number
          grid_rows: number
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grid_cols?: number
          grid_rows?: number
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grid_cols?: number
          grid_rows?: number
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      security_events: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"] | null
          actor_user_id: string | null
          amount: number | null
          cash_difference: number | null
          cash_movement_reason: string | null
          cash_movement_type: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string | null
          group_key: string | null
          id: string | null
          metadata: Json | null
          reason: string | null
          restaurant_id: string | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["audit_action"] | null
          actor_user_id?: string | null
          amount?: never
          cash_difference?: never
          cash_movement_reason?: never
          cash_movement_type?: never
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: never
          group_key?: never
          id?: string | null
          metadata?: Json | null
          reason?: never
          restaurant_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"] | null
          actor_user_id?: string | null
          amount?: never
          cash_difference?: never
          cash_movement_reason?: never
          cash_movement_type?: never
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: never
          group_key?: never
          id?: string | null
          metadata?: Json | null
          reason?: never
          restaurant_id?: string | null
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
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_device: {
        Args: { p_name: string; p_token: string }
        Returns: Json
      }
      approve_customer_order: {
        Args: { p_order_id: string }
        Returns: Json
      }
      can_handle_cash: {
        Args: { p_register_id?: string; p_restaurant_id: string }
        Returns: boolean
      }
      cash_cut: {
        Args: {
          p_cash_float_left?: number
          p_cash_session_id: string
          p_counts: Json
          p_notes?: string
          p_skip_pending_orders?: boolean
        }
        Returns: Json
      }
      create_device_link: {
        Args: {
          p_name?: string
          p_restaurant_id: string
          p_ttl_minutes?: number
        }
        Returns: Json
      }
      get_cash_cut_precheck: {
        Args: { p_cash_session_id: string }
        Returns: Json
      }
      get_customer_account: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_customer_session: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_device_link_info: {
        Args: { p_token: string }
        Returns: Json
      }
      get_last_cash_float: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_staff_counters: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      is_cash_admin: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      list_cash_cuts: {
        Args: {
          p_before_cut?: number
          p_limit?: number
          p_register_id?: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      list_cash_movements: {
        Args: {
          p_cash_session_id?: string
          p_limit?: number
          p_register_id?: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      list_devices: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      mark_order_reviewed: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      open_table_from_qr: {
        Args: { p_customer_label: string; p_qr_token: string }
        Returns: Json
      }
      pin_login: {
        Args: { p_device_secret: string; p_pin: string }
        Returns: Json
      }
      reject_customer_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      revoke_device: {
        Args: { p_device_id: string }
        Returns: undefined
      }
      set_qr_settings: {
        Args: {
          p_call_cooldown_seconds?: number
          p_require_approval?: boolean
          p_restaurant_id: string
        }
        Returns: Json
      }
      validate_device: {
        Args: { p_device_secret: string }
        Returns: Json
      }
      accept_and_prepare_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      accept_order: { Args: { p_order_id: string }; Returns: undefined }
      add_cash_movement: {
        Args: {
          p_amount: number
          p_cash_session_id: string
          p_description: string
          p_idempotency_key: string
          p_reason: Database["public"]["Enums"]["cash_movement_reason"]
          p_type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Returns: Json
      }
      add_items_to_bill: {
        Args: {
          p_bill_id: string
          p_idempotency_key: string
          p_items: Json
          p_send_to_kitchen?: boolean
        }
        Returns: Json
      }
      add_staff_member: {
        Args: {
          p_full_name: string
          p_restaurant_id: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_user_id: string
        }
        Returns: string
      }
      add_ticket: {
        Args: {
          p_items: Json
          p_order_id: string
          p_request_id?: string
          p_table_id?: string
        }
        Returns: Json
      }
      apply_bill_discount: {
        Args: {
          p_bill_id: string
          p_kind: Database["public"]["Enums"]["discount_kind"]
          p_order_item_id?: string
          p_reason: string
          p_value: number
        }
        Returns: Json
      }
      assert_can_manage_member: {
        Args: { p_member_id: string }
        Returns: string
      }
      bill_json: { Args: { p_bill_id: string }; Returns: Json }
      build_order_lines: {
        Args: { p_items: Json; p_restaurant_id: string }
        Returns: Json
      }
      business_date: {
        Args: { p_restaurant_id: string; p_ts?: string }
        Returns: string
      }
      business_day_bounds: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          end_at: string
          start_at: string
        }[]
      }
      business_today: { Args: { p_restaurant_id: string }; Returns: string }
      can_manage_staff_role: {
        Args: {
          p_restaurant_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: boolean
      }
      cancel_counter_sale: {
        Args: { p_bill_id: string; p_reason: string }
        Returns: Json
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_order_item: {
        Args: { p_order_item_id: string; p_reason: string }
        Returns: Json
      }
      cancel_order_with_reason: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      cash_session_expected: {
        Args: { p_cash_session_id: string }
        Returns: {
          expected: number
          method: Database["public"]["Enums"]["payment_method"]
        }[]
      }
      check_member_pin: {
        Args: { p_pin: string; p_restaurant_id: string }
        Returns: {
          member_id: string
          roles: string[]
          status: string
        }[]
      }
      close_bill: { Args: { p_bill_id: string }; Returns: Json }
      close_cash_session: {
        Args: { p_cash_session_id: string; p_counts: Json; p_notes?: string }
        Returns: Json
      }
      close_table_session: {
        Args: { p_force?: boolean; p_reason?: string; p_table_id: string }
        Returns: undefined
      }
      complete_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      counter_sale_json: {
        Args: { p_replayed: boolean; p_session_id: string }
        Returns: Json
      }
      create_counter_order: {
        Args: {
          p_client_request_id: string
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery_address?: Json
          p_delivery_provider?: string
          p_external_order_id?: string
          p_general_comment?: string
          p_items: Json
          p_pay_later?: boolean
          p_pays_with_amount?: number
          p_preferred_payment_method?: string
          p_restaurant_id?: string
          p_service_type: string
          p_shipping_cost?: number
        }
        Returns: Json
      }
      create_counter_sale: {
        Args: {
          p_customer_label?: string
          p_idempotency_key: string
          p_items: Json
          p_notes?: string
          p_restaurant_id?: string
        }
        Returns: Json
      }
      create_customer_order: {
        Args: {
          p_client_request_id?: string
          p_items: Json
          p_notes?: string
          p_session_token: string
        }
        Returns: string
      }
      create_staff_order: {
        Args: {
          p_client_request_id?: string
          p_items: Json
          p_notes?: string
          p_table_id: string
        }
        Returns: string
      }
      create_table: {
        Args: {
          p_col: number
          p_height_cells?: number
          p_number?: number
          p_row: number
          p_shape?: string
          p_width_cells?: number
          p_zone_id: string
        }
        Returns: string
      }
      create_waiter_call: {
        Args: {
          p_session_token: string
          p_type: Database["public"]["Enums"]["waiter_call_type"]
        }
        Returns: string
      }
      create_zone: {
        Args: {
          p_grid_cols?: number
          p_grid_rows?: number
          p_name: string
          p_restaurant_id: string
        }
        Returns: string
      }
      delete_table: { Args: { p_table_id: string }; Returns: undefined }
      delete_zone: { Args: { p_zone_id: string }; Returns: undefined }
      edit_order_item: {
        Args: {
          p_notes?: string
          p_order_item_id: string
          p_variant_id?: string
        }
        Returns: Json
      }
      expire_idle_empty_table_sessions: {
        Args: { p_restaurant_id?: string }
        Returns: number
      }
      finalize_bill: {
        Args: { p_bill_id: string; p_user_id: string }
        Returns: {
          balance: number
          bill_number: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          discount_total: number
          id: string
          invoice_id: string | null
          opened_at: string
          opened_by: string | null
          paid_at: string | null
          paid_total: number
          restaurant_id: string
          split_mode: Database["public"]["Enums"]["bill_split_mode"]
          split_parts: number
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          table_id: string
          table_session_id: string
          tip_total: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_or_create_active_table_session: {
        Args: { p_restaurant_id: string; p_table_id: string }
        Returns: {
          client_request_id: string | null
          closed_at: string | null
          counter_number: number | null
          customer_label: string | null
          id: string
          last_activity_at: string
          restaurant_id: string
          session_token: string
          started_at: string
          status: Database["public"]["Enums"]["table_session_status"]
          table_id: string
          table_kind: Database["public"]["Enums"]["table_kind"]
        }
        SetofOptions: {
          from: "*"
          to: "table_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_member_pin: { Args: { p_member_id: string }; Returns: string }
      generate_order_short_code: {
        Args: { p_restaurant_id: string }
        Returns: string
      }
      get_admin_menu: { Args: { p_restaurant_id: string }; Returns: Json }
      get_bill: { Args: { p_bill_id: string }; Returns: Json }
      get_cash_session_summary: {
        Args: { p_cash_session_id: string }
        Returns: Json
      }
      get_customer_order: {
        Args: { p_order_id: string; p_session_token: string }
        Returns: Json
      }
      get_dashboard_summary: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_kitchen_tickets: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_restaurant_id: string
          p_since?: string
          p_status?: string
        }
        Returns: Json
      }
      get_my_restaurant: { Args: never; Returns: Json }
      get_public_menu: { Args: { p_slug: string }; Returns: Json }
      get_restaurant_staff: { Args: { p_restaurant_id: string }; Returns: Json }
      get_sales_report: {
        Args: { p_days?: number; p_restaurant_id: string }
        Returns: Json
      }
      get_session_bill: { Args: { p_session_token: string }; Returns: Json }
      get_session_calls: { Args: { p_session_token: string }; Returns: Json }
      get_session_orders: { Args: { p_session_token: string }; Returns: Json }
      get_staff_members: { Args: { p_restaurant_id: string }; Returns: Json }
      get_staff_orders: {
        Args: {
          p_limit?: number
          p_restaurant_id: string
          p_statuses?: Database["public"]["Enums"]["order_status"][]
        }
        Returns: Json
      }
      get_staff_pin_status: {
        Args: { p_restaurant_id: string }
        Returns: {
          has_pin: boolean
          member_id: string
        }[]
      }
      get_tables_status: { Args: { p_restaurant_id: string }; Returns: Json }
      get_top_products: {
        Args: { p_limit?: number; p_restaurant_id: string }
        Returns: Json
      }
      get_waiter_calls: {
        Args: {
          p_restaurant_id: string
          p_statuses?: Database["public"]["Enums"]["waiter_call_status"][]
        }
        Returns: Json
      }
      handle_waiter_call: {
        Args: {
          p_call_id: string
          p_status: Database["public"]["Enums"]["waiter_call_status"]
        }
        Returns: undefined
      }
      health_check: { Args: never; Returns: string }
      insert_order_lines: {
        Args: { p_lines: Json; p_order_id: string; p_ticket_id: string }
        Returns: undefined
      }
      kds_lock_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      list_open_bills: { Args: { p_restaurant_id: string }; Returns: Json }
      lock_bill: {
        Args: { p_bill_id: string }
        Returns: {
          balance: number
          bill_number: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          discount_total: number
          id: string
          invoice_id: string | null
          opened_at: string
          opened_by: string | null
          paid_at: string | null
          paid_total: number
          restaurant_id: string
          split_mode: Database["public"]["Enums"]["bill_split_mode"]
          split_parts: number
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          table_id: string
          table_session_id: string
          tip_total: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lock_counter_table: {
        Args: { p_restaurant_id: string }
        Returns: {
          col: number | null
          created_at: string
          height_cells: number
          id: string
          kind: Database["public"]["Enums"]["table_kind"]
          name: string | null
          number: number
          qr_token: string
          restaurant_id: string
          row: number | null
          shape: string
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
          width_cells: number
          zone_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tables"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      m03_check_placement: {
        Args: {
          p_col: number
          p_exclude_table_id: string
          p_height: number
          p_row: number
          p_width: number
          p_zone_id: string
        }
        Returns: undefined
      }
      m03_require_zone_admin: {
        Args: { p_restaurant_id: string }
        Returns: string
      }
      m06_normalize_counter_fields: {
        Args: {
          p_address: Json
          p_external_id: string
          p_name: string
          p_pays_with: number
          p_phone: string
          p_pref_method: string
          p_provider: string
          p_service_type: string
          p_shipping: number
        }
        Returns: Json
      }
      mark_order_delivered: { Args: { p_order_id: string }; Returns: undefined }
      mark_order_ready: { Args: { p_order_id: string }; Returns: undefined }
      move_table: {
        Args: {
          p_col: number
          p_height_cells: number
          p_number?: number
          p_row: number
          p_shape?: string
          p_table_id: string
          p_width_cells: number
        }
        Returns: undefined
      }
      open_bill: { Args: { p_table_session_id: string }; Returns: Json }
      open_cash_session: {
        Args: { p_opening_float?: number; p_register_id: string }
        Returns: Json
      }
      open_table: { Args: { p_table_id: string }; Returns: Json }
      place_label: {
        Args: {
          p_counter_number: number
          p_customer_label: string
          p_kind: Database["public"]["Enums"]["table_kind"]
          p_table_number: number
        }
        Returns: string
      }
      product_effective_available: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      recompute_bill: {
        Args: { p_bill_id: string }
        Returns: {
          balance: number
          bill_number: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          discount_total: number
          id: string
          invoice_id: string | null
          opened_at: string
          opened_by: string | null
          paid_at: string | null
          paid_total: number
          restaurant_id: string
          split_mode: Database["public"]["Enums"]["bill_split_mode"]
          split_parts: number
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          table_id: string
          table_session_id: string
          tip_total: number
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment: {
        Args: {
          p_amount: number
          p_auto_close?: boolean
          p_bill_id: string
          p_card_type?: string
          p_cash_session_id?: string
          p_idempotency_key: string
          p_items?: Json
          p_method: Database["public"]["Enums"]["payment_method"]
          p_reference?: string
          p_tendered_amount?: number
          p_tip_amount?: number
        }
        Returns: Json
      }
      record_payments: {
        Args: {
          p_amount: number
          p_auto_close?: boolean
          p_bill_id: string
          p_cash_session_id?: string
          p_items?: Json
          p_payments: Json
          p_request_id: string
          p_tip_amount?: number
        }
        Returns: Json
      }
      refresh_table_status: { Args: { p_table_id: string }; Returns: undefined }
      reject_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      remove_bill_discount: {
        Args: { p_discount_id: string; p_reason?: string }
        Returns: Json
      }
      reopen_table: { Args: { p_table_session_id: string }; Returns: Json }
      report_discounts: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          amount: number
          applied_at: string
          applied_by: string
          applied_by_name: string
          bill_id: string
          bill_number: number
          bill_status: Database["public"]["Enums"]["bill_status"]
          business_date: string
          discount_id: string
          kind: Database["public"]["Enums"]["discount_kind"]
          order_item_id: string
          place_label: string
          product_name: string
          reason: string
          table_name: string
          table_number: number
          value: number
        }[]
      }
      report_guard: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          cutoff: string
          end_at: string
          start_at: string
          tz: string
        }[]
      }
      report_payments_by_method: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          amount: number
          method: Database["public"]["Enums"]["payment_method"]
          payments_count: number
          tips: number
          total_collected: number
          voided_amount: number
          voided_count: number
        }[]
      }
      report_peak_hours: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          hour: number
          isodow: number
          items_count: number
          orders_count: number
          orders_total: number
        }[]
      }
      report_prep_times: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          avg_minutes: number
          discarded_count: number
          orders_count: number
          p50_minutes: number
          p90_minutes: number
          stage: string
        }[]
      }
      report_sales_by_category: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          category_id: string
          category_name: string
          gross_sales: number
          orders_count: number
          products_count: number
          quantity: number
        }[]
      }
      report_sales_by_period: {
        Args: {
          p_from: string
          p_granularity?: string
          p_restaurant_id: string
          p_to: string
        }
        Returns: {
          avg_ticket: number
          bills_count: number
          delivered_orders_total: number
          discounts: number
          gross_sales: number
          net_sales: number
          period_end: string
          period_start: string
          tips: number
        }[]
      }
      report_sales_by_product: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          category_id: string
          category_name: string
          gross_sales: number
          orders_count: number
          product_id: string
          product_name: string
          quantity: number
        }[]
      }
      report_sales_by_staff: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          full_name: string
          member_role: Database["public"]["Enums"]["member_role"]
          orders_accepted: number
          orders_accepted_total: number
          payments_amount: number
          payments_count: number
          tips_amount: number
          user_id: string
        }[]
      }
      report_sales_summary: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: Json
      }
      resolve_open_cash_session: {
        Args: { p_cash_session_id?: string; p_restaurant_id: string }
        Returns: string
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
      restaurant_tz: { Args: { p_restaurant_id: string }; Returns: string }
      return_ticket_to_preparation: {
        Args: { p_ticket_id: string }
        Returns: Json
      }
      save_product_variants: {
        Args: { p_product_id: string; p_variants: Json }
        Returns: undefined
      }
      save_product_with_variants: {
        Args: {
          p_available?: boolean
          p_category_id?: string
          p_description?: string
          p_featured?: boolean
          p_name: string
          p_paired_drink_id?: string
          p_product_id?: string
          p_restaurant_id: string
          p_variants: Json
        }
        Returns: string
      }
      set_bill_split: {
        Args: {
          p_bill_id: string
          p_mode: Database["public"]["Enums"]["bill_split_mode"]
          p_parts?: number
        }
        Returns: Json
      }
      set_item_availability: {
        Args: { p_available: boolean; p_item_id: string; p_item_type: string }
        Returns: undefined
      }
      set_kds_settings: {
        Args: {
          p_alert_minutes?: number
          p_enabled?: boolean
          p_restaurant_id: string
          p_warn_minutes?: number
        }
        Returns: Json
      }
      start_order_preparing: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      sync_legacy_modifier_group: {
        Args: { p_option_id: string }
        Returns: undefined
      }
      table_effective_status: {
        Args: { p_table_id: string }
        Returns: Database["public"]["Enums"]["table_status"]
      }
      table_session_has_unpaid_consumption: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      table_session_last_activity: {
        Args: { p_session_id: string }
        Returns: string
      }
      transfer_order: {
        Args: { p_order_id: string; p_target_table_id: string }
        Returns: Json
      }
      unlock_pin_login: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      update_counter_order: {
        Args: {
          p_changes: Json
          p_confirm_total_increase?: boolean
          p_order_id: string
        }
        Returns: Json
      }
      update_staff_member: {
        Args: {
          p_member_id: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_status: Database["public"]["Enums"]["member_status"]
        }
        Returns: undefined
      }
      update_zone: {
        Args: {
          p_grid_cols: number
          p_grid_rows: number
          p_name: string
          p_zone_id: string
        }
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
      void_bill: {
        Args: { p_bill_id: string; p_reason: string }
        Returns: Json
      }
      void_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: Json
      }
      void_payment_with_refund: {
        Args: {
          p_payment_id: string
          p_reason: string
          p_refund_method?: Database["public"]["Enums"]["payment_method"]
        }
        Returns: Json
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
        | "OPEN_BILL"
        | "APPLY_DISCOUNT"
        | "REMOVE_DISCOUNT"
        | "SET_BILL_SPLIT"
        | "RECORD_PAYMENT"
        | "VOID_PAYMENT"
        | "CLOSE_BILL"
        | "VOID_BILL"
        | "FORCE_CLOSE_SESSION"
        | "OPEN_CASH_SESSION"
        | "CLOSE_CASH_SESSION"
        | "CASH_MOVEMENT"
        | "ADD_BILL_ITEMS"
      bill_split_mode: "NONE" | "EQUAL" | "ITEMS"
      bill_status: "OPEN" | "PAID" | "CLOSED" | "VOID"
      cash_movement_reason:
        | "FLOAT_TOPUP"
        | "TIPS_PAYOUT"
        | "SUPPLIER_PAYMENT"
        | "EXPENSE"
        | "REFUND"
        | "WITHDRAWAL"
        | "OTHER"
      cash_movement_type: "IN" | "OUT"
      cash_session_status: "OPEN" | "CLOSED"
      discount_kind: "PERCENT" | "FIXED"
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
      payment_method: "CASH" | "CARD" | "TRANSFER" | "OTHER"
      payment_status: "COMPLETED" | "VOIDED"
      restaurant_status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
      table_kind: "TABLE" | "COUNTER"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
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
        "OPEN_BILL",
        "APPLY_DISCOUNT",
        "REMOVE_DISCOUNT",
        "SET_BILL_SPLIT",
        "RECORD_PAYMENT",
        "VOID_PAYMENT",
        "CLOSE_BILL",
        "VOID_BILL",
        "FORCE_CLOSE_SESSION",
        "OPEN_CASH_SESSION",
        "CLOSE_CASH_SESSION",
        "CASH_MOVEMENT",
        "ADD_BILL_ITEMS",
      ],
      bill_split_mode: ["NONE", "EQUAL", "ITEMS"],
      bill_status: ["OPEN", "PAID", "CLOSED", "VOID"],
      cash_movement_reason: [
        "FLOAT_TOPUP",
        "TIPS_PAYOUT",
        "SUPPLIER_PAYMENT",
        "EXPENSE",
        "REFUND",
        "WITHDRAWAL",
        "OTHER",
      ],
      cash_movement_type: ["IN", "OUT"],
      cash_session_status: ["OPEN", "CLOSED"],
      discount_kind: ["PERCENT", "FIXED"],
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
      payment_method: ["CASH", "CARD", "TRANSFER", "OTHER"],
      payment_status: ["COMPLETED", "VOIDED"],
      restaurant_status: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      table_kind: ["TABLE", "COUNTER"],
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
