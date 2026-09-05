import type { Metadata } from "next";
import { getTableSession } from "@/lib/session";
import { getPublicMenu } from "@/lib/queries/menu";
import { MenuHeader } from "./_components/menu-header";
import { MenuBrowser } from "./_components/menu-browser";
import { ActiveOrdersBanner } from "./_components/active-orders-banner";
import { ActiveCallBanner } from "./_components/active-call-banner";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function MenuPage({
  params,
}: {
  params: Promise<{ slug: string; mesa: string }>;
}) {
  const { slug } = await params;
  const session = await getTableSession();
  const menu = await getPublicMenu(slug);

  /**
   * Dos modos, decididos por si hay sesión de mesa viva:
   *
   * - "mesa": el cliente escaneó el QR y está sentado. Pide normal y
   *   el pedido entra al panel del mesero en tiempo real.
   * - "carta": no hay sesión (se llevó la carta a casa, abrió un link
   *   compartido, o la sesión ya venció). Ve la carta completa y puede
   *   armar su pedido, pero se envía por WhatsApp — NO a una mesa.
   *
   * Deliberadamente la sesión sigue siendo corta y atada a la mesa: si
   * no expirara, alguien pidiendo desde su casa mandaría comida a una
   * mesa donde ya está sentada otra gente, y la cuenta le caería a
   * ellos.
   */
  const inTable = Boolean(session && session.restaurantSlug === slug);

  return (
    <main className="min-h-full">
      <MenuHeader
        restaurant={menu.restaurant}
        tableNumber={inTable ? session!.tableNumber : null}
      />
      {inTable && (
        <>
          <ActiveOrdersBanner slug={slug} tableNumber={session!.tableNumber} />
          <ActiveCallBanner />
        </>
      )}
      <MenuBrowser
        categories={menu.categories}
        slug={slug}
        tableNumber={inTable ? session!.tableNumber : null}
        restaurantName={menu.restaurant.name}
        whatsappPhone={menu.restaurant.phone}
      />
    </main>
  );
}
