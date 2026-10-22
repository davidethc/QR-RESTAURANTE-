/** Cookie httpOnly con el secreto del dispositivo vinculado (la pone el servidor). */
export const DEVICE_COOKIE = "monky_device";

/** Un año: el dispositivo se desvincula revocándolo, no por vencimiento. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  };
}
