import { z } from "zod";

/** Nombre para la mesa: 2 a 40 caracteres, sin caracteres de control (igual que la base). */
export const tableNameSchema = z
  .string({ message: "Escribe un nombre para la mesa." })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(40, "El nombre admite hasta 40 caracteres.")
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "El nombre tiene caracteres no válidos.")
  );

/** Segundos que faltan para `endsAt` (epoch ms); 0 si ya pasó. */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** 75 -> "1:15", 9 -> "0:09". */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
