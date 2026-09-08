"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

/** Tope por operación: un dedo resbalado no debe crear mil filas. */
const MAX_TABLES_PER_BATCH = 50;

/**
 * Crea mesas por rango. Con `from` igual a `to`, crea una sola.
 *
 * No hace falta ningún RPC: la política `tables_insert_admin` ya limita
 * la escritura a OWNER/ADMIN del restaurante, igual que en las actions
 * de la carta. Y el `qr_token` no se pasa a propósito — la columna
 * tiene `default gen_random_uuid()`, así que **el QR de cada mesa lo
 * genera la base al crearla**.
 *
 * El nombre solo se aplica cuando se crea UNA mesa: ponerle "Terraza"
 * a un rango de diez dejaría diez mesas llamadas igual.
 */
export async function createTables(
  restaurantId: string,
  fromNumber: number,
  toNumber: number,
  name?: string
): Promise<ActionResult<number>> {
  if (!Number.isInteger(fromNumber) || !Number.isInteger(toNumber)) {
    return { ok: false, error: "Los números de mesa deben ser enteros." };
  }
  if (fromNumber < 1) {
    return { ok: false, error: "El número de mesa empieza en 1." };
  }
  if (toNumber < fromNumber) {
    return { ok: false, error: "El número final no puede ser menor que el inicial." };
  }

  const count = toNumber - fromNumber + 1;
  if (count > MAX_TABLES_PER_BATCH) {
    return {
      ok: false,
      error: `Máximo ${MAX_TABLES_PER_BATCH} mesas por vez (pediste ${count}).`,
    };
  }

  const isSingle = count === 1;
  const rows = Array.from({ length: count }, (_, i) => ({
    restaurant_id: restaurantId,
    number: fromNumber + i,
    name: isSingle && name?.trim() ? name.trim() : null,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from("tables").insert(rows);

  if (error) {
    // 23505 = violación de unicidad sobre (restaurant_id, number).
    // El texto crudo de Postgres no le dice nada a un dueño de local.
    if (error.code === "23505") {
      return {
        ok: false,
        error: isSingle
          ? `La mesa ${fromNumber} ya existe.`
          : `Alguna mesa entre la ${fromNumber} y la ${toNumber} ya existe. No se creó ninguna.`,
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/tables");
  return { ok: true, data: count };
}

export async function closeTableSession(
  tableId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("close_table_session", {
    p_table_id: tableId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tables");
  return { ok: true, data: undefined };
}
