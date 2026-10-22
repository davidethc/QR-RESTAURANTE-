"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/db-errors";
import { NO_SECRET_KEY_MESSAGE } from "@/lib/devices/messages";
import { MissingServiceKeyError, renameDeviceRow } from "@/lib/devices/service";
import {
  createDeviceLinkSchema,
  deviceIdSchema,
  renameDeviceSchema,
  type DeviceRow,
} from "@/lib/validations/devices";
import { z } from "zod";
import type { ActionResult } from "@/types/actions";

/** Administración de dispositivos (dueño y administrador; la base decide). */

export async function createDeviceLink(
  input: unknown
): Promise<ActionResult<{ deviceId: string; token: string; expiresAt: string }>> {
  const parsed = createDeviceLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_device_link", {
    p_restaurant_id: parsed.data.restaurantId,
    p_name: parsed.data.name,
  });
  if (error) return { ok: false, error: userFacingDbError(error, "create_device_link") };
  const row = data as unknown as { device_id: string; link_token: string; expires_at: string };
  revalidatePath("/staff");
  return { ok: true, data: { deviceId: row.device_id, token: row.link_token, expiresAt: row.expires_at } };
}

export async function listDevicesAction(restaurantId: unknown): Promise<ActionResult<DeviceRow[]>> {
  const id = z.string().uuid().safeParse(restaurantId);
  if (!id.success) return { ok: false, error: "Sucursal inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_devices", { p_restaurant_id: id.data });
  if (error) return { ok: false, error: userFacingDbError(error, "list_devices") };
  return { ok: true, data: (data ?? []) as unknown as DeviceRow[] };
}

export async function revokeDevice(input: unknown): Promise<ActionResult> {
  const parsed = deviceIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_device", { p_device_id: parsed.data.deviceId });
  if (error) return { ok: false, error: userFacingDbError(error, "revoke_device") };
  revalidatePath("/staff");
  return { ok: true, data: undefined };
}

export async function renameDevice(input: unknown): Promise<ActionResult> {
  const parsed = renameDeviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { restaurantId, deviceId, name } = parsed.data;

  // list_devices exige OWNER/ADMIN con la sesión de quien llama: si el
  // dispositivo aparece ahí, puede renombrarlo. Recién entonces se usa la llave.
  const supabase = await createClient();
  const listed = await supabase.rpc("list_devices", { p_restaurant_id: restaurantId });
  if (listed.error) return { ok: false, error: userFacingDbError(listed.error, "list_devices") };
  const device = ((listed.data ?? []) as unknown as DeviceRow[]).find((d) => d.id === deviceId);
  if (!device || device.status !== "ACTIVE") {
    return { ok: false, error: "Solo se puede renombrar un dispositivo vinculado." };
  }

  try {
    const { error } = await renameDeviceRow(deviceId, name);
    if (error) return { ok: false, error: userFacingDbError(error, "renameDevice") };
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return { ok: false, error: NO_SECRET_KEY_MESSAGE };
    throw e;
  }
  revalidatePath("/staff");
  return { ok: true, data: undefined };
}
