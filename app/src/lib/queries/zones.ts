import { createClient } from "@/lib/supabase/server";

export type ZoneRow = {
  id: string;
  name: string;
  gridCols: number;
  gridRows: number;
};

export type ZoneTable = {
  id: string;
  number: number;
  shape: "square" | "round";
  col: number | null;
  row: number | null;
  widthCells: number;
  heightCells: number;
};

export async function getZones(restaurantId: string): Promise<ZoneRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zones")
    .select("id, name, grid_cols, grid_rows")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    gridCols: z.grid_cols,
    gridRows: z.grid_rows,
  }));
}

export async function getZoneWithTables(
  restaurantId: string,
  zoneId: string
): Promise<{ zone: ZoneRow; tables: ZoneTable[] } | null> {
  const supabase = await createClient();
  const { data: z, error } = await supabase
    .from("zones")
    .select("id, name, grid_cols, grid_rows")
    .eq("restaurant_id", restaurantId)
    .eq("id", zoneId)
    .maybeSingle();
  if (error) throw error;
  if (!z) return null;
  const { data: t, error: tErr } = await supabase
    .from("tables")
    .select("id, number, shape, col, row, width_cells, height_cells")
    .eq("zone_id", zoneId)
    .order("number");
  if (tErr) throw tErr;
  return {
    zone: { id: z.id, name: z.name, gridCols: z.grid_cols, gridRows: z.grid_rows },
    tables: (t ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      shape: r.shape === "round" ? "round" : "square",
      col: r.col,
      row: r.row,
      widthCells: r.width_cells,
      heightCells: r.height_cells,
    })),
  };
}
