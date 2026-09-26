import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/queries/menu";
import { MenuHeader } from "./[mesa]/_components/menu-header";
import { MenuBrowser } from "./[mesa]/_components/menu-browser";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

/**
 * Carta para compartir: /r/<slug>. Es el link que el restaurante pone
 * en Instagram, Google Maps o manda por WhatsApp a quien está fuera del
 * local. Misma carta que en la mesa, pero SIEMPRE en modo carta: el
 * pedido se arma aquí y se envía por WhatsApp, nunca a una mesa.
 *
 * No lee la cookie de sesión a propósito: aunque quien lo abra tenga
 * una sesión de mesa viva, este link nunca puede mandar pedidos a
 * cocina. Para pedir a la mesa está el QR impreso (/scan/<token>).
 */
export default async function CartaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const menu = await getPublicMenu(slug);

  return (
    <main className="min-h-full">
      <MenuHeader restaurant={menu.restaurant} tableNumber={null} />
      <MenuBrowser
        categories={menu.categories}
        slug={slug}
        tableNumber={null}
        restaurantName={menu.restaurant.name}
        whatsappPhone={menu.restaurant.phone}
      />
    </main>
  );
}
