import type { Metadata } from "next";
import { getTableSession } from "@/lib/session";
import { getPublicMenu } from "@/lib/queries/menu";
import { getTableStatus } from "@/lib/actions/table-status";
import { getSessionChannelName } from "@/lib/session-channel";
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
  // Las tres consultas se lanzan a la vez y se esperan después. Antes
  // los pedidos en curso salían en un `await` encadenado DESPUÉS de
  // resolver la carta (tres latencias en serie), así que el cliente no
  // veía ni un plato hasta que también habían vuelto sus pedidos.
  //
  // `getTableStatus` lee la cookie por su cuenta y devuelve
  // `{ ok: false }` si no hay sesión, sin llegar a tocar la base — por
  // eso se puede lanzar antes de saber si el cliente está en una mesa:
  // sin sesión no cuesta ni una petición de red.
  const menuPromise = getPublicMenu(slug);
  const statusPromise = getTableStatus();
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

  // Pedidos Y solicitudes en curso se resuelven en el servidor, para que
  // la franja de arriba y los botones de abajo salgan ya pintados en el
  // primer HTML y el celular no tenga que pedir nada al arrancar. A
  // partir de ahí los refresca la señal de Realtime del provider.
  const initialStatus = inTable ? await statusPromise : null;
  // El nombre del canal es un hash del token de sesión: el token en sí
  // nunca sale del servidor (la cookie es httpOnly). Ver session-channel.ts.
  const channelName = inTable ? await getSessionChannelName() : null;

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
          initialStatus={
            initialStatus?.ok ? initialStatus.data : { orders: [], calls: [] }
          }
          channelName={channelName}
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
