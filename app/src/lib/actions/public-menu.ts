"use server";

import { getPublicMenu } from "@/lib/queries/menu";
import type { PublicCategory } from "@/types/menu";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Carta pública fresca para el refresco en vivo del comensal. Lee la misma
 * caché etiquetada (`menu-<slug>`) que la página, que el panel invalida al
 * cambiar disponibilidad; no abre acceso nuevo a la base para anónimos.
 */
export async function fetchPublicMenuCategories(slug: string): Promise<PublicCategory[] | null> {
  if (typeof slug !== "string" || !SLUG.test(slug)) return null;
  try {
    return (await getPublicMenu(slug)).categories;
  } catch {
    return null;
  }
}
