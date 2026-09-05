import type { Metadata } from "next";
import { getTableSession } from "@/lib/session";
import { getPublicMenu } from "@/lib/queries/menu";
import { getSessionOrders } from "@/lib/actions/orders";
import { MenuHeader } from "./_components/menu-header";
import { MenuBrowser } from "./_components/menu-browser";
import { TableStatusProvider } from "./_components/table-status-provider";
import { ActiveOrderStrip } from "./_components/active-order-strip";

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
  // La carta y la sesión de mesa no dependen una de otra: se piden a la
  // vez y se esperan juntas. En serie eran dos latencias encadenadas
  // antes de que el cliente viera un solo plato.
  const menuPromise = getPublicMenu(slug);
  const session = await getTableSession();
  const menu = await menuPromise;

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

  // Los pedidos en curso se resuelven en el servidor para que la franja
  // salga ya pintada en el primer HTML; a partir de ahí los refresca el
  // sondeo del provider. Antes se pintaban una vez y se quedaban
  // congelados: un pedido podía estar LISTO y seguir diciendo PENDIENTE
  // hasta que el cliente recargara a mano.
  const initialOrders = inTable ? await getSessionOrders() : null;

  return (
    <main className="min-h-full">
      <MenuHeader
        restaurant={menu.restaurant}
        tableNumber={inTable ? session!.tableNumber : null}
      />
      {/* Un solo latido alimenta la franja de arriba y los botones de
          la barra inferior — son el mismo dato: qué tiene esta mesa en
          curso. Fuera de una mesa no se monta, así que la carta a
          domicilio no hace ni un sondeo. */}
      {inTable ? (
        <TableStatusProvider
          initialOrders={initialOrders?.ok ? initialOrders.data : []}
        >
          <ActiveOrderStrip slug={slug} tableNumber={session!.tableNumber} />
          <MenuBrowser
            categories={menu.categories}
            slug={slug}
            tableNumber={session!.tableNumber}
            restaurantName={menu.restaurant.name}
            whatsappPhone={menu.restaurant.phone}
          />
        </TableStatusProvider>
      ) : (
        <MenuBrowser
          categories={menu.categories}
          slug={slug}
          tableNumber={null}
          restaurantName={menu.restaurant.name}
          whatsappPhone={menu.restaurant.phone}
        />
      )}
    </main>
  );
}
