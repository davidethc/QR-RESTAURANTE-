"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getMyRestaurant, getTablesStatus, getTopProducts } from "@/lib/queries/staff";
import { getPublicMenu } from "@/lib/queries/menu";
import { getStaffProductDetails } from "@/lib/queries/staff-catalog";
import { hasPermission, isManager } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import type { PublicCategory, StaffProductDetail } from "@/types/menu";
import type { TableStatus } from "@/config/constants";
import type { MyRestaurant, TopProduct } from "@/types/staff";

/**
 * Datos del constructor de pedidos de Caja ("Nuevo pedido"). Se piden al
 * abrirlo, no al cargar /cash: la carta con variantes pesa y la mayoría de
 * las visitas a Caja son para cobrar. Solo lecturas que ya existían
 * (get_public_menu, get_tables_status, catálogo del personal); los pedidos
 * se crean con las acciones de siempre (createCounterOrder, addTicket).
 *
 * Quién: los mismos que pueden tomar pedidos (OWNER/ADMIN/WAITER y CASHIER
 * con caja asignada, lo exige la RPC). El mesero no entra a /cash, pero la
 * regla vive aquí igual.
 */

export interface BuilderTable {
  id: string;
  number: number;
  name: string | null;
  status: TableStatus;
  activeTotal: number;
}

export interface OrderBuilderData {
  categories: PublicCategory[];
  topProducts: TopProduct[];
  details: Record<string, StaffProductDetail>;
  tables: BuilderTable[];
}

function canTakeOrders(session: MyRestaurant): boolean {
  return isManager(session.role) || hasPermission(session, "tables") || hasPermission(session, "pos");
}

export async function getOrderBuilderData(): Promise<ActionResult<OrderBuilderData>> {
  try {
    const session = await getMyRestaurant();
    if (!canTakeOrders(session)) return { ok: false, error: "No autorizado para tomar pedidos." };
    const [menu, topProducts, details, tables] = await Promise.all([
      getPublicMenu(session.restaurant.slug),
      getTopProducts(session.restaurant.id),
      getStaffProductDetails(session.restaurant.id),
      getTablesStatus(session.restaurant.id),
    ]);
    return {
      ok: true,
      data: {
        categories: menu.categories,
        topProducts,
        details,
        // Sin qr_token: el constructor no lo necesita y no debe viajar al navegador.
        tables: tables
          .filter((t) => t.status !== "INACTIVE")
          .map((t) => ({ id: t.id, number: t.number, name: t.name, status: t.status, activeTotal: t.active_total }))
          .sort((a, b) => a.number - b.number),
      },
    };
  } catch {
    return { ok: false, error: "No se pudo cargar la carta. Intenta de nuevo." };
  }
}

/**
 * Pedido vigente de una mesa (o null si la próxima comanda lo crea). addTicket
 * necesita este id: si la mesa ya tiene pedido y se manda null, la base lo
 * rechaza. Misma consulta que getActiveOrderForTable, sin leer las comandas.
 */
export async function getTableOrderTarget(tableId: string): Promise<ActionResult<{ orderId: string | null }>> {
  const parsed = z.uuid().safeParse(tableId);
  if (!parsed.success) return { ok: false, error: "Mesa inválida." };
  try {
    const session = await getMyRestaurant();
    if (!canTakeOrders(session)) return { ok: false, error: "No autorizado para tomar pedidos." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, table_sessions!inner(status)")
      .eq("table_id", parsed.data)
      .eq("restaurant_id", session.restaurant.id)
      .eq("cancelled", false)
      .eq("table_sessions.status", "ACTIVE")
      .not("status", "in", "(REJECTED,CANCELLED)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data: { orderId: (data as { id: string } | null)?.id ?? null } };
  } catch {
    return { ok: false, error: "No se pudo revisar la mesa. Intenta de nuevo." };
  }
}
