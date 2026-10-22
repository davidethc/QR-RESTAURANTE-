import { z } from "zod";

const uuid = z.uuid({ message: "Identificador inválido" });
const gridSize = (label: string) =>
  z
    .number({ message: `${label}: escribe un número.` })
    .int(`${label}: debe ser entero.`)
    .min(1, `${label}: mínimo 1.`)
    .max(30, `${label}: máximo 30.`);
const zoneName = z
  .string()
  .trim()
  .min(1, "Escribe el nombre de la zona.")
  .max(60, "El nombre es demasiado largo (máximo 60).");
const cell = (label: string) =>
  z
    .number({ message: `${label}: escribe un número.` })
    .int(`${label}: debe ser entero.`)
    .min(0, `${label}: no puede ser negativo.`);
const size = (label: string) =>
  z
    .number({ message: `${label}: escribe un número.` })
    .int(`${label}: debe ser entero.`)
    .min(1, `${label}: mínimo 1.`);
const shape = z.enum(["square", "round"], { message: "Forma inválida." });
const tableNumber = z
  .number({ message: "El identificador debe ser un número." })
  .int("El identificador debe ser entero.")
  .min(1, "El identificador empieza en 1.");

export const createZoneSchema = z.object({
  restaurantId: uuid,
  name: zoneName,
  gridCols: gridSize("Columnas").default(7),
  gridRows: gridSize("Filas").default(5),
});
export const updateZoneSchema = z.object({
  zoneId: uuid,
  name: zoneName,
  gridCols: gridSize("Columnas"),
  gridRows: gridSize("Filas"),
});
export const zoneIdSchema = uuid;

export const createTableInCellSchema = z.object({
  zoneId: uuid,
  col: cell("Columna"),
  row: cell("Fila"),
  number: tableNumber.optional(),
  shape: shape.default("square"),
  widthCells: size("Ancho").default(1),
  heightCells: size("Alto").default(1),
});
export const moveTableSchema = z.object({
  tableId: uuid,
  col: cell("Columna"),
  row: cell("Fila"),
  widthCells: size("Ancho"),
  heightCells: size("Alto"),
  shape: shape.optional(),
  number: tableNumber.optional(),
});
export const tableIdSchema = uuid;

export type CreateZoneInput = z.input<typeof createZoneSchema>;
export type UpdateZoneInput = z.input<typeof updateZoneSchema>;
export type CreateTableInCellInput = z.input<typeof createTableInCellSchema>;
export type MoveTableInput = z.input<typeof moveTableSchema>;
