"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE, deviceCookieOptions } from "@/lib/devices/constants";
import {
  DEVICE_REVOKED_MESSAGE,
  NO_SECRET_KEY_MESSAGE,
  pinFailureMessage,
} from "@/lib/devices/messages";
import {
  MissingServiceKeyError,
  activateDevice,
  mintLoginTokenHash,
  pinLogin,
} from "@/lib/devices/service";
import { userFacingDbError } from "@/lib/db-errors";
import { activateDeviceSchema, pinSchema } from "@/lib/validations/devices";
import type { ActionResult } from "@/types/actions";

/**
 * Sesión en un dispositivo vinculado. El secreto del dispositivo vive solo en
 * una cookie httpOnly; el navegador nunca lo lee. Nada de lo que pasa por aquí
 * (token, secreto, PIN) se escribe en logs.
 */

const GENERIC = "No se pudo completar la operación. Intenta de nuevo.";

/** /activar: consume el enlace de un solo uso y guarda el secreto en la cookie. */
export async function activateDeviceAction(input: unknown): Promise<ActionResult> {
  const parsed = activateDeviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const { data, error } = await activateDevice(parsed.data.token, parsed.data.name);
    if (error || !data?.device_secret) {
      return { ok: false, error: error ? userFacingDbError(error, "activateDevice") : GENERIC };
    }
    (await cookies()).set(DEVICE_COOKIE, data.device_secret, deviceCookieOptions());
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return { ok: false, error: NO_SECRET_KEY_MESSAGE };
    console.error("[activateDeviceAction] fallo inesperado");
    return { ok: false, error: GENERIC };
  }
}

/** /pin: valida el PIN en el dispositivo y abre la sesión del miembro. */
export async function pinLoginAction(pin: unknown): Promise<ActionResult> {
  const parsed = pinSchema.safeParse(pin);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const jar = await cookies();
  const secret = jar.get(DEVICE_COOKIE)?.value;
  if (!secret) return { ok: false, error: DEVICE_REVOKED_MESSAGE, code: "DEVICE_INVALID" };

  try {
    const { data, error } = await pinLogin(secret, parsed.data);
    if (error || !data) {
      return { ok: false, error: error ? userFacingDbError(error, "pinLogin") : GENERIC };
    }
    if (data.status !== "OK") {
      if (data.status === "DEVICE_INVALID") jar.delete(DEVICE_COOKIE);
      return { ok: false, error: pinFailureMessage(data.status), code: data.status };
    }
    if (!data.user_id) return { ok: false, error: GENERIC };

    const tokenHash = await mintLoginTokenHash(data.user_id);
    if (!tokenHash) {
      console.error("[pinLoginAction] no se pudo preparar la sesión");
      return { ok: false, error: "Tu cuenta no puede iniciar sesión por PIN. Habla con un administrador." };
    }
    const supabase = await createClient();
    const verified = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verified.error) {
      console.error("[pinLoginAction] verifyOtp", verified.error.code);
      return { ok: false, error: GENERIC };
    }
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return { ok: false, error: NO_SECRET_KEY_MESSAGE };
    console.error("[pinLoginAction] fallo inesperado");
    return { ok: false, error: GENERIC };
  }
}
