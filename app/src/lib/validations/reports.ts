import { z } from "zod";

/**
 * Validaciones del módulo Reportes. `report_guard` (M14) vuelve a validar
 * todo esto en la base — esto solo da mensajes claros antes del viaje de
 * red y evita mandar basura obvia (fechas mal formadas, rango invertido).
 */

const uuid = (message = "Identificador inválido") => z.uuid({ message });

const dateStr = (label: string) =>
  z
    .string({ message: `${label}: fecha requerida.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: formato de fecha inválido.`);

export const reportRangeSchema = z
  .object({
    restaurantId: uuid("Restaurante inválido"),
    from: dateStr("Desde"),
    to: dateStr("Hasta"),
  })
  .refine((v) => v.to >= v.from, {
    message: "La fecha final es anterior a la inicial.",
    path: ["to"],
  })
  .refine(
    (v) => {
      const from = new Date(`${v.from}T00:00:00Z`);
      const to = new Date(`${v.to}T00:00:00Z`);
      const days = (to.getTime() - from.getTime()) / 86_400_000 + 1;
      return days <= 400;
    },
    { message: "El rango máximo es de 400 días.", path: ["to"] }
  );

export const reportRangeWithGranularitySchema = z
  .object({
    restaurantId: uuid("Restaurante inválido"),
    from: dateStr("Desde"),
    to: dateStr("Hasta"),
    granularity: z.enum(["day", "week", "month"]).default("day"),
  })
  .refine((v) => v.to >= v.from, {
    message: "La fecha final es anterior a la inicial.",
    path: ["to"],
  })
  .refine(
    (v) => {
      const from = new Date(`${v.from}T00:00:00Z`);
      const to = new Date(`${v.to}T00:00:00Z`);
      const days = (to.getTime() - from.getTime()) / 86_400_000 + 1;
      return days <= 400;
    },
    { message: "El rango máximo es de 400 días.", path: ["to"] }
  );

export type ReportRangeInput = z.input<typeof reportRangeSchema>;
export type ReportRangeWithGranularityInput = z.input<typeof reportRangeWithGranularitySchema>;
