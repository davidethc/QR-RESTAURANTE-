import { updateTag } from "next/cache";
import { getMyRestaurant } from "@/lib/queries/staff";

/**
 * Refresca la carta pública cacheada (`menu-<slug>`) del restaurante de quien
 * está escribiendo. El slug sale del servidor (`getMyRestaurant`), nunca de un
 * argumento del cliente: un slug manipulado solo invalidaría la carta de otro
 * local, pero no hay motivo para aceptarlo desde afuera.
 *
 * Se llama después de una escritura exitosa: si falla la consulta, el cambio
 * ya está guardado y la carta se pone al día sola al vencer su caché, así que
 * se registra y no se convierte en error para el usuario.
 */
export async function refreshPublicMenuTag(): Promise<void> {
  try {
    const { restaurant } = await getMyRestaurant();
    updateTag(`menu-${restaurant.slug}`);
  } catch (error) {
    console.error("[refreshPublicMenuTag]", error);
  }
}
