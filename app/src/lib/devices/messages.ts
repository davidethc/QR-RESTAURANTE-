/** Textos del acceso por PIN. Puro: sin servidor, se usa también en pruebas. */

export const NO_SECRET_KEY_MESSAGE =
  "Falta configurar SUPABASE_SECRET_KEY en el servidor para usar dispositivos con PIN.";

export const DEVICE_REVOKED_MESSAGE =
  "Este dispositivo ya no tiene acceso. Pide a un administrador que lo vincule de nuevo.";

export type PinStatus = "OK" | "INVALID" | "LOCKED" | "DEVICE_INVALID";

export function pinFailureMessage(status: string): string {
  switch (status) {
    case "INVALID":
      return "PIN incorrecto. Revísalo e inténtalo de nuevo.";
    case "LOCKED":
      return "Demasiados intentos fallidos. Espera unos minutos; si sigue bloqueado, pide a un administrador que desbloquee el acceso por PIN.";
    case "DEVICE_INVALID":
      return DEVICE_REVOKED_MESSAGE;
    default:
      return "No se pudo iniciar sesión. Intenta de nuevo.";
  }
}
