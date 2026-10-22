"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callUntypedRpc } from "@/lib/supabase/untyped-rpc";
import {
  createTableInCellSchema,
  createZoneSchema,
  moveTableSchema,
  tableIdSchema,
  updateZoneSchema,
  zoneIdSchema,
  type CreateTableInCellInput,
  type CreateZoneInput,
  type MoveTableInput,
  type UpdateZoneInput,
} from "@/lib/validations/zones";
import { dbFailure } from "@/lib/db-errors";
import type { ActionResult } from "@/types/actions";

/**
 * Zonas y mesas (M03-T03). Toda la lógica (rol OWNER/ADMIN, solapamiento,
 * límites del plano, sesiones activas) vive en las RPCs; aquí solo se
 * valida la forma de los datos y se traduce el resultado. El qr_token lo
 * genera la base al crear la mesa.
 */

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

async function run<T>(
  fn: string,
  args: Record<string, unknown>,
  context: string
): Promise<ActionResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await callUntypedRpc<T>(supabase, fn, args);
    if (error) return dbFailure(error, context);
    revalidatePath("/settings");
    revalidatePath("/tables");
    return { ok: true, data: data as T };
  } catch (e) {
    console.error(`[${context}]`, e);
    return { ok: false, error: "No se pudo completar la operación. Intenta de nuevo." };
  }
}

export async function createZone(input: CreateZoneInput): Promise<ActionResult<string>> {
  const p = createZoneSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run<string>(
    "create_zone",
    {
      p_restaurant_id: p.data.restaurantId,
      p_name: p.data.name,
      p_grid_cols: p.data.gridCols,
      p_grid_rows: p.data.gridRows,
    },
    "createZone"
  );
}

export async function updateZone(input: UpdateZoneInput): Promise<ActionResult> {
  const p = updateZoneSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run<void>(
    "update_zone",
    {
      p_zone_id: p.data.zoneId,
      p_name: p.data.name,
      p_grid_cols: p.data.gridCols,
      p_grid_rows: p.data.gridRows,
    },
    "updateZone"
  );
}

export async function deleteZone(zoneId: string): Promise<ActionResult> {
  const p = zoneIdSchema.safeParse(zoneId);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run<void>("delete_zone", { p_zone_id: p.data }, "deleteZone");
}

export async function createTableInCell(
  input: CreateTableInCellInput
): Promise<ActionResult<string>> {
  const p = createTableInCellSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run<string>(
    "create_table",
    {
      p_zone_id: p.data.zoneId,
      p_col: p.data.col,
      p_row: p.data.row,
      p_number: p.data.number ?? null,
      p_shape: p.data.shape,
      p_width_cells: p.data.widthCells,
      p_height_cells: p.data.heightCells,
    },
    "createTableInCell"
  );
}

export async function moveTable(input: MoveTableInput): Promise<ActionResult> {
  const p = moveTableSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run<void>(
    "move_table",
    {
      p_table_id: p.data.tableId,
      p_col: p.data.col,
      p_row: p.data.row,
      p_width_cells: p.data.widthCells,
      p_height_cells: p.data.heightCells,
      p_shape: p.data.shape ?? null,
      p_number: p.data.number ?? null,
    },
    "moveTable"
  );
}

export async function deleteTable(tableId: string): Promise<ActionResult> {
  const p = tableIdSchema.safeParse(tableId);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  return run<void>("delete_table", { p_table_id: p.data }, "deleteTable");
}
