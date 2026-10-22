import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { NO_SECRET_KEY_MESSAGE } from "./messages";

/**
 * Llamadas con la llave secreta (service_role) a las RPC de M10. Solo servidor.
 * Nunca registrar secretos, tokens ni PIN: aquí no se loguea ningún argumento.
 */

export class MissingServiceKeyError extends Error {
  constructor() {
    super(NO_SECRET_KEY_MESSAGE);
    this.name = "MissingServiceKeyError";
  }
}

export interface DeviceInfo {
  device_id: string;
  restaurant_id: string;
  name: string | null;
}

export interface PinLoginResult {
  status: "OK" | "INVALID" | "LOCKED" | "DEVICE_INVALID";
  user_id?: string;
  member_id?: string;
  restaurant_id?: string;
}

function service() {
  const client = createAdminClient();
  if (!client) throw new MissingServiceKeyError();
  return client;
}

export async function getLinkInfo(token: string) {
  const { data, error } = await service().rpc("get_device_link_info", { p_token: token });
  if (error) throw error;
  return (data ?? null) as
    | { device_id: string; restaurant_id: string; restaurant_name: string; suggested_name: string | null }
    | null;
}

export async function activateDevice(token: string, name: string) {
  const { data, error } = await service().rpc("activate_device", { p_token: token, p_name: name });
  return { data: (data ?? null) as (DeviceInfo & { device_secret: string }) | null, error };
}

/** "revoked" = la base respondió que ya no vale; "unavailable" = no se pudo comprobar. */
export async function checkDevice(
  secret: string
): Promise<{ state: "valid"; device: DeviceInfo } | { state: "revoked" } | { state: "unavailable" }> {
  const client = createAdminClient();
  if (!client) return { state: "unavailable" };
  try {
    const { data, error } = await client.rpc("validate_device", { p_device_secret: secret });
    if (error) return { state: "unavailable" };
    if (!data) return { state: "revoked" };
    return { state: "valid", device: data as DeviceInfo };
  } catch {
    return { state: "unavailable" };
  }
}

export async function pinLogin(secret: string, pin: string) {
  const { data, error } = await service().rpc("pin_login", { p_device_secret: secret, p_pin: pin });
  return { data: (data ?? null) as PinLoginResult | null, error };
}

export async function getRestaurantName(restaurantId: string): Promise<string | null> {
  const { data } = await service().from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/**
 * Prepara la sesión del usuario que acaba de pasar el PIN: un magic link
 * generado en el servidor (no se envía por correo) cuyo hash se canjea con
 * verifyOtp en el cliente SSR, que es quien pone las cookies de sesión.
 */
export async function mintLoginTokenHash(userId: string): Promise<string | null> {
  const admin = service();
  const user = await admin.auth.admin.getUserById(userId);
  const email = user.data.user?.email;
  if (user.error || !email) return null;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  return link.data?.properties?.hashed_token ?? null;
}

/** Cambia el nombre. El permiso ya lo confirmó list_devices con la sesión de quien llama. */
export async function renameDeviceRow(deviceId: string, name: string) {
  return service().from("devices").update({ name }).eq("id", deviceId).is("revoked_at", null);
}
